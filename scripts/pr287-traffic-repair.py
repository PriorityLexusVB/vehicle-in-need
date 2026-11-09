"""PREPARED ONLY. Fixed PR287 recovery through the existing Cloud Build identity.

No general command, image, revision, project, or service inputs are accepted.
Applying/merging the accompanying workflow amendment and executing this file
require new explicit approval. Importing the module performs no IO.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import signal
import sys
import tempfile
import threading
import time
import urllib.request
import uuid

PROJECT = "gen-lang-client-0615287333"
REGION = "us-west1"
SERVICE = "pre-order-dealer-exchange-tracker"
COMMIT = "6753792b1b51a65377b7e8a955fc27c68ecda799"
VERSION = "6753792"
TARGET = SERVICE + "-00367-qsx"
PRIOR = SERVICE + "-pr286live-20261009"
PRIOR_VERSION = "86cb242"
PRIOR_DIGEST = "sha256:7bed22c82c2a3249f838b8da5a26f428a5b735561af635c928da4a22410fd64a"
DIGEST = "sha256:76cd7c8cf42f7d6d1b4a63a97022bb8baea43d27148a4a940881b413bf09316d"
IMAGE = "us-west1-docker.pkg.dev/" + PROJECT + "/vehicle-in-need/" + SERVICE + "@" + DIGEST
TAG = "p287-6753792"
PREPARATION_PARENT = "0edd4e59f094cb576cd6cb9fd7f3cd798cd495ea"
BASE_URL = "https://" + SERVICE + "-842946218691.us-west1.run.app"
PROBE_URL = "https://" + TAG + "---" + SERVICE + "-842946218691." + REGION + ".run.app"
MODE = "repair-pr287-6753792"
FILES = [".github/workflows/build-and-deploy.yml", "scripts/pr287-traffic-repair.py"]
DEADLINE = 0
MAX_OPERATION_SECONDS = 30
MAX_REQUEST_BYTES = 64 * 1024
MAX_RESPONSE_BYTES = 1024 * 1024
clock = time.monotonic
BUDGET = None
REPAIR_STARTED = 0
UNCERTAIN_MUTATION = False
# Counts are native invocation attempts / explicit metadata reads / status-child
# attempts / native mutations. gcloud's internal HTTP calls/bytes are UNKNOWN.
LIMITS = {"submit": (5, 0, 0, 1, 150), "repair": (40, 26, 11, 3, 270),
          "recovery": (8, 5, 1, 2, 270), "watch": (24, 24, 0, 0, 660)}


class LimitError(RuntimeError):
    def __init__(self, message, started=False):
        super().__init__(message)
        self.started = started


class Budget:
    def __init__(self, phase, deadline=None):
        self.phase = phase
        self.limits = LIMITS[phase]
        self.counts = [0, 0, 0, 0]
        self.deadline = min(clock() + self.limits[4], deadline) if deadline is not None else clock() + self.limits[4]

    def remaining(self):
        return self.deadline - clock()

    def reserve(self, kind):
        require(kind in ("native", "metadata", "status", "mutation"), "Unknown operation category")
        additions = [1, int(kind == "metadata"), int(kind == "status"), int(kind == "mutation")]
        if self.remaining() <= 1:
            raise LimitError("HOLD_BUDGET: " + self.phase + " deadline exhausted")
        if any(n + add > cap for n, add, cap in zip(self.counts, additions, self.limits)):
            raise LimitError("HOLD_BUDGET: " + self.phase + " native/metadata/status/mutation cap exhausted")
        self.counts = [n + add for n, add in zip(self.counts, additions)]


def start_budget(phase):
    global BUDGET, DEADLINE, REPAIR_STARTED
    if phase == "repair":
        REPAIR_STARTED = clock()
    outer = REPAIR_STARTED + 540 if phase == "recovery" else None
    BUDGET = Budget(phase, outer)
    DEADLINE = BUDGET.deadline


def request_bytes(payload):
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(encoded) > MAX_REQUEST_BYTES:
        raise LimitError("Request exceeds64KiB")
    return encoded


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def command(args, kind="native", operation_timeout=MAX_OPERATION_SECONDS, input_bytes=None):
    # No shell or unbounded request/response. Only the fixed API worker
    # accepts a bounded private stdin payload. No communicate/capture_output or unbounded
    # read. Both pipes share one retained-byte ceiling and are drained together.
    if sum(len(arg.encode("utf-8")) + 1 for arg in args) > MAX_REQUEST_BYTES:
        raise LimitError("Native command input exceeds64KiB")
    if input_bytes is not None and len(input_bytes) > MAX_REQUEST_BYTES:
        raise LimitError("Private pipe input exceeds64KiB")
    require(BUDGET is not None, "Budget required")
    BUDGET.reserve(kind)
    duration = min(MAX_OPERATION_SECONDS, operation_timeout, BUDGET.remaining())
    if duration <= 0.1:
        raise LimitError("No operation time remains")
    # Leave time to kill/reap the Linux process group inside the same30seconds.
    cleanup = min(1, duration / 5)
    deadline = clock() + duration
    work_end = deadline - cleanup
    process = subprocess.Popen(args, stdin=subprocess.PIPE if input_bytes is not None else subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=(os.name == "posix"))
    buffers = [bytearray(), bytearray()]
    state = {"bytes": 0, "overflow": False, "read_error": False}
    lock = threading.Lock()

    def drain(stream, index):
        try:
            while True:
                with lock:
                    count = min(8192, MAX_RESPONSE_BYTES - state["bytes"] + 1)
                chunk = stream.read1(count)
                if not chunk:
                    return
                with lock:
                    if state["bytes"] + len(chunk) > MAX_RESPONSE_BYTES:
                        state["overflow"] = True
                        return
                    buffers[index].extend(chunk)
                    state["bytes"] += len(chunk)
        except OSError:
            state["read_error"] = True

    readers = [threading.Thread(target=drain, args=(stream, index), daemon=True)
               for index, stream in enumerate((process.stdout, process.stderr))]
    if input_bytes is not None:
        def send_private():
            try:
                process.stdin.write(input_bytes)
                process.stdin.close()
            except OSError:
                state["read_error"] = True
        readers.append(threading.Thread(target=send_private, daemon=True))
    for reader in readers:
        reader.start()
    failure = None
    try:
        while process.poll() is None or any(reader.is_alive() for reader in readers):
            if state["overflow"]:
                failure = "Native stdout+stderr exceeds1MiB"
                break
            if clock() >= work_end:
                failure = "Native operation timeout<=30seconds"
                break
            time.sleep(min(0.01, max(0, work_end - clock())))
        if state["overflow"]:
            failure = "Native stdout+stderr exceeds1MiB"
        if state["read_error"]:
            failure = "Native response read failed; outcome unknown"
        if failure:
            raise LimitError(failure, started=True)
        if process.returncode != 0:
            raise LimitError("Native command failed; remote outcome unproven", started=True)
        return buffers[0].decode("utf-8").strip()
    finally:
        if os.name == "posix" or failure or process.poll() is None:
            # Hosted runtime is Linux. The Windows fallback exists only for
            # offline tests with direct local Python children (no descendants).
            try:
                if os.name == "posix":
                    os.killpg(process.pid, signal.SIGKILL)
                elif process.poll() is None:
                    process.kill()
            except ProcessLookupError:
                pass
        try:
            process.wait(timeout=max(0.001, deadline - clock()))
        except subprocess.TimeoutExpired:
            raise LimitError("HOLD_NATIVE_EXIT: process-group exit not proved", started=True)
        for reader in readers:
            reader.join(timeout=max(0, deadline - clock()))
        if any(reader.is_alive() for reader in readers):
            raise LimitError("HOLD_NATIVE_EXIT: bounded pipe drain not proved", started=True)
        process.stdout.close()
        process.stderr.close()


def cloud(*args, kind="metadata"):
    return command(["gcloud", *args, "--project=" + PROJECT, "--region=" + REGION], kind=kind)


def service():
    return json.loads(cloud("run", "services", "describe", SERVICE, "--format=json"))


def revision(name):
    return json.loads(cloud("run", "revisions", "describe", name, "--format=json"))


def update(*args):
    global UNCERTAIN_MUTATION
    UNCERTAIN_MUTATION = True
    try:
        cloud("run", "services", "update-traffic", SERVICE, *args, "--quiet", kind="mutation")
    except LimitError as error:
        if not error.started:
            UNCERTAIN_MUTATION = False
        raise
    else:
        UNCERTAIN_MUTATION = False


def conditions(document):
    return {c["type"]: c for c in document.get("status", {}).get("conditions", [])}


def true_condition(condition):
    return str(condition.get("status", "")).lower() == "true"


def identity(document):
    require(document.get("metadata", {}).get("name") == TARGET, "Unexpected revision")
    containers = document.get("spec", {}).get("containers", [])
    require(len(containers) == 1, "Unexpected container count")
    resolved = document.get("status", {}).get("imageDigest", containers[0].get("image"))
    require(resolved == IMAGE, "Resolved image digest mismatch")
    require(containers[0].get("image") in (IMAGE, IMAGE.split("@")[0] + ":" + VERSION), "Unexpected image reference")
    versions = [e.get("value") for e in containers[0].get("env", []) if e.get("name") == "APP_VERSION"]
    require(versions == [VERSION], "APP_VERSION mismatch")


def healthy_revision(document):
    identity(document)
    cs = conditions(document)
    require(all(true_condition(cs.get(k, {})) for k in ("Ready", "ResourcesAvailable", "ContainerHealthy")),
            "Target has not proved Ready/ResourcesAvailable/ContainerHealthy")
    require(not any("RETIR" in str(c.get("reason", "")).upper() or
                    "RETIR" in str(c.get("revisionReason", "")).upper() for c in cs.values()),
            "Retired revision is not a serving-readiness proof")


def template_hash(document):
    spec = copy.deepcopy(document["spec"])
    spec.pop("traffic", None)
    return hashlib.sha256(json.dumps(spec, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def tags(document, scope):
    return {t["tag"]: t.get("revisionName") for t in document[scope].get("traffic", []) if t.get("tag")}


def one_hundred(document, scope, revision_name):
    allocations = [(t.get("revisionName"), t.get("percent", 0))
                   for t in document[scope].get("traffic", []) if t.get("percent", 0) > 0]
    require(allocations == [(revision_name, 100)], "Unexpected " + scope + " traffic preimage")


def service_guard(document, baseline, revision_name, staged):
    require(document.get("metadata", {}).get("name") == SERVICE, "Unexpected service")
    require(template_hash(document) == template_hash(baseline), "Service template/config changed")
    fixed_tag_map(document["spec"].get("traffic", []))
    fixed_tag_map(document["status"].get("traffic", []))
    require(document["status"].get("observedGeneration") == document["metadata"].get("generation"),
            "Service reconciliation has not completed")
    require(true_condition(conditions(document).get("Ready", {})), "Service not Ready")
    expected_tags = tags(baseline, "spec")
    if staged:
        expected_tags = {**expected_tags, TAG: TARGET}
    for scope in ("spec", "status"):
        one_hundred(document, scope, revision_name)
        require(tags(document, scope) == expected_tags, "Existing tags changed or probe collision")
    if staged:
        uris = [t.get("url") for t in document["status"]["traffic"] if t.get("tag") == TAG]
        require(uris == [PROBE_URL], "Unexpected probe endpoint")


# A separate fixed child gives the entire HTTP connect/header/body operation an
# absolute native30second ceiling, not merely a per-socket timeout. Its output
# is also collected by command's shared1MiB bounded stream reader.
STATUS_FETCH = r'''
import json, sys, urllib.request, urllib.parse
MAX = 1024 * 1024
ALLOWED = (
"https://pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app",
"https://p287-6753792---pre-order-dealer-exchange-tracker-842946218691.us-west1.run.app")
if len(sys.argv) != 2 or sys.argv[1] not in ALLOWED:
    raise RuntimeError("Unapproved status endpoint")
host = urllib.parse.urlsplit(sys.argv[1]).hostname
if not host or any(not label or len(label) > 63 for label in host.split(".")) or host.encode("idna").decode("ascii") != host:
    raise RuntimeError("Invalid status DNS host")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
url = sys.argv[1] + "/api/status"
headers = {"Cache-Control": "no-cache", "Pragma": "no-cache", "Accept-Encoding": "identity"}
if len(("GET " + url + "\r\n" + json.dumps(headers)).encode("utf-8")) > 64 * 1024:
    raise RuntimeError("HTTP request exceeds64KiB")
request = urllib.request.Request(url, headers=headers)
with urllib.request.build_opener(NoRedirect()).open(request, timeout=12) as response:
    if response.status != 200:
        raise RuntimeError("Status HTTP failure")
    declared = response.headers.get("Content-Length")
    if declared is not None and (not declared.isdigit() or int(declared) > MAX):
        raise RuntimeError("HTTP body length exceeds1MiB or invalid")
    body = bytearray()
    while True:
        chunk = response.read(min(8192, MAX - len(body) + 1))
        if not chunk:
            break
        if len(body) + len(chunk) > MAX:
            raise RuntimeError("HTTP body exceeds1MiB")
        body.extend(chunk)
sys.stdout.buffer.write(body)
'''


def status(url, version=VERSION):
    require(url in (BASE_URL, PROBE_URL), "Unapproved endpoint")
    document = json.loads(command([sys.executable, "-c", STATUS_FETCH, url], kind="status"))
    require(document.get("status") == "healthy" and document.get("version") == version,
            "Health/version receiving failed")


def wait_for(check, seconds=90):
    end = min(clock() + seconds, DEADLINE)
    last = None
    while clock() < end:
        try:
            return check()
        except LimitError:
            raise  # Never turn a limit/unknown invocation into an automatic retry.
        except (RuntimeError, subprocess.SubprocessError, OSError, ValueError) as error:
            last = error
            time.sleep(min(5, max(0, end - clock())))
    raise RuntimeError("Readiness/receiving deadline: " + str(last))


def repair():
    global UNCERTAIN_MUTATION
    UNCERTAIN_MUTATION = False
    start_budget("repair")
    validate_probe_endpoint()
    baseline = service()
    binding = json.loads(os.environ["PR287_PROMOTION_BINDING"])
    check_promotion_preimage(baseline, binding)
    expected_generation = [binding["before"]["generation"]]
    def fenced_service():
        current = service()
        expected = {**binding["before"], "generation": expected_generation[0]}
        actual = v1_fence(current)
        require(all(actual[k] == expected[k] for k in ("uid", "generation", "config")), "In-build configuration/version drift")
        return current
    def fenced_update(argument):
        update(argument)
        expected_generation[0] += 1
    require(TAG not in tags(baseline, "spec") and TAG not in tags(baseline, "status"), "Probe tag already exists")
    service_guard(baseline, baseline, PRIOR, False)
    prior = revision(PRIOR)
    require(prior.get("metadata", {}).get("name") == PRIOR, "Unexpected rollback revision")
    prior_image = prior.get("status", {}).get("imageDigest", prior["spec"]["containers"][0].get("image", ""))
    require(prior_image == IMAGE.split("@")[0] + "@" + PRIOR_DIGEST, "Rollback image changed")
    require(all(true_condition(conditions(prior).get(k, {}))
                for k in ("Ready", "ResourcesAvailable", "ContainerHealthy")), "Rollback revision not healthy")
    status(BASE_URL, PRIOR_VERSION)
    identity(revision(TARGET))
    # Actual saved target is retired: do NOT promote it directly. A zero-normal-
    # traffic tag starts it so container readiness and an HTTP response are real.
    staged = False
    promoted = False
    try:
        # Mark before the command: a timeout may have applied a remote mutation.
        staged = True
        fenced_update("--update-tags=" + TAG + "=" + TARGET)

        def staged_ready():
            service_guard(fenced_service(), baseline, PRIOR, True)
            healthy_revision(revision(TARGET))
            status(PROBE_URL)
        wait_for(staged_ready, 120)
        # Refresh the exact preimage immediately before percentage mutation.
        staged_ready()
        promoted = True
        fenced_update("--to-revisions=" + TARGET + "=100")

        def receiving():
            service_guard(fenced_service(), baseline, TARGET, True)
            healthy_revision(revision(TARGET))
            status(BASE_URL)
        wait_for(receiving)
        fenced_update("--remove-tags=" + TAG)
        wait_for(lambda: service_guard(fenced_service(), baseline, TARGET, False), 60)
        healthy_revision(revision(TARGET))
        status(BASE_URL)
        completed = fenced_service()
        check_promotion_postimage(completed, binding)
        emit_postimage(completed, binding)
        print("PASS: promotion admission postimage proved; signed-in UI remains separate")
    except Exception as original:
        # Rob's current approval explicitly requires asking before ANY rollback.
        # A prior command may have changed remote state. Do not reverse traffic,
        # remove tags on the error path, retry, or imply the old release serves.
        raise RuntimeError("HOLD_PROMOTION_NOT_PROVEN: traffic/tag changes may be applied or UNKNOWN; "
                           "no automatic rollback, cleanup or retry; separate native Rob approval required; "
                           + str(original)) from original


CLOUD_LOADER = "import sys; _sealed_code=''.join(sys.argv[2:]); del sys.argv[2:]; exec(compile(_sealed_code,'<sealed-inline>','exec'))"


def cloud_step_args(code, mode):
    require(isinstance(code, str) and 0 < len(code.encode("utf-8")) <= MAX_REQUEST_BYTES, "Bounded sealed inline code required")
    require(mode in ("cloud-run-repair", "cloud-run-late-rollback", "bdc-cloud"), "Fixed cloud mode required")
    args = ["-c", CLOUD_LOADER, mode] + [code[i:i+8000] for i in range(0, len(code), 8000)]
    require(len(args) <= 100 and all(len(arg) <= 10000 for arg in args), "Cloud Build argument limits")
    return args


def runtime_inline_code():
    actual = sys.orig_argv
    require(len(actual) >= 5 and actual[1:3] == ["-c", CLOUD_LOADER], "Exact sealed cloud loader required")
    mode = actual[3]
    code = "".join(actual[4:])
    require(actual[1:] == cloud_step_args(code, mode), "Noncanonical cloud chunks or mode")
    require(sys.argv == ["-c", mode], "Cloud application argv drift")
    return code


def validate_probe_endpoint():
    import urllib.parse
    expected_base = "https://" + SERVICE + "-842946218691." + REGION + ".run.app"
    expected_probe = "https://p287-6753792---" + SERVICE + "-842946218691." + REGION + ".run.app"
    require(TAG == "p287-6753792" and BASE_URL == expected_base and PROBE_URL == expected_probe,
            "Fixed deterministic Vehicle probe drift")
    for url in (BASE_URL, PROBE_URL):
        parts = urllib.parse.urlsplit(url)
        require(parts.scheme == "https" and not parts.username and not parts.password and parts.port is None and
                not parts.path and not parts.query and not parts.fragment, "Fixed Vehicle URL shape required")
        host = parts.hostname
        require(host and host.isascii() and len(host) <= 253 and all(0 < len(label) <= 63 for label in host.split(".")),
                "Vehicle DNS label exceeds63")
        require(host.encode("idna").decode("ascii") == host, "Vehicle DNS IDNA invalid")


def submit():
    start_budget("submit")
    validate_probe_endpoint()
    require(os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch", "Manual dispatch required")
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "Main only")
    action = os.environ.get("RELEASE_ACTION")
    require(action in (MODE, LATE_MODE), "Fixed action required")
    github = github_binding()
    if action == MODE:
        require_bookkeeping_input()
    require(bool(os.environ.get("GITHUB_OUTPUT")), "GitHub output channel required before submission")
    sha = os.environ.get("GITHUB_SHA", "")
    require(sha and command(["git", "rev-parse", "HEAD"]) == sha, "Checkout SHA mismatch")
    parents = command(["git", "rev-list", "--parents", "-n", "1", "HEAD"]).split()
    require(parents == [sha, PREPARATION_PARENT], "Requires reviewed two-file DNS amendment directly on0edd")
    changed = command(["git", "diff", "--name-only", PREPARATION_PARENT, sha]).splitlines()
    require(sorted(changed) == FILES, "Amendment includes unexpected files")
    require(command(["git", "ls-remote", "origin", "refs/heads/main"]).split()[0] == sha,
            "Main advanced since dispatch; stop")
    code = Path(__file__).read_text(encoding="utf-8")
    if action == MODE:
        binding = promotion_binding()
        mode, marker = "cloud-run-repair", PROMOTION_TAG
        env = ["PR287_PROMOTION_BINDING=" + canonical(binding).decode()]
    else:
        packet = parse_receiving(os.environ.get("PR287_RECEIVING_ADMISSION", ""))
        promotion, binding = load_promotion(packet["body"]["promotion_build"], code)
        bind_late(packet, promotion, binding, github)
        mode, marker = "cloud-run-late-rollback", LATE_TAG
        env = ["PR287_LATE_ADMISSION=" + canonical(packet).decode(), "PR287_LATE_RUN=" + canonical(github).decode()]
    build = {"steps": [{"name": "gcr.io/google.com/cloudsdktool/cloud-sdk",
                        "id": "pr287-exact-traffic-recovery", "entrypoint": "python3",
                        "args": cloud_step_args(code, mode), "env": env}],
             "options": {"logging": "CLOUD_LOGGING_ONLY"}, "timeout": "360s" if action == LATE_MODE else "600s",
             "tags": [marker]}
    # No source upload, image build, tag push, service-account override, IAM,
    # environment/secret update, login, token export, or credential file.
    with tempfile.TemporaryDirectory(prefix="pr287-ci-") as directory:
        config = Path(directory) / "cloudbuild-pr287.json"
        encoded = request_bytes(build)
        require(chr(36) not in encoded.decode(), "Build substitution metacharacter refused")
        config.write_bytes(encoded)
        try:
            build_id = command(["gcloud", "builds", "submit", "--project=" + PROJECT,
                                "--no-source", "--async", "--config=" + str(config), "--format=value(id)"], kind="mutation")
        except LimitError as error:
            if error.started:
                raise RuntimeError("HOLD_SUBMISSION_OUTCOME_UNKNOWN: build may exist; no repeat/cancel or alternate route") from error
            raise
    require(str(uuid.UUID(build_id)) == build_id, "Unexpected build ID")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write("build_id=" + build_id + "\nshort_sha=" + VERSION + "\n")
    print("Submitted existing-identity traffic-only recovery build " + build_id)


def watch_impl():
    # Fixed read-only monitoring of only the ID produced by this job. No log
    # streaming: gcloud describe invocations and their responses are bounded.
    start_budget("watch")
    build_id = os.environ.get("PR287_BUILD_ID", "")
    require(str(uuid.UUID(build_id)) == build_id, "Invalid produced build ID")
    expected_code = Path(__file__).read_text(encoding="utf-8")
    late = os.environ.get("RELEASE_ACTION") == LATE_MODE
    expected_mode = "cloud-run-late-rollback" if late else "cloud-run-repair"
    expected_tag = LATE_TAG if late else PROMOTION_TAG
    while True:
        try:
            document = json.loads(command(["gcloud", "builds", "describe", build_id,
                                           "--project=" + PROJECT, "--format=json"], kind="metadata"))
        except (RuntimeError, OSError, ValueError) as error:
            raise RuntimeError("HOLD_BUILD_OUTCOME: watcher response unavailable; build may still run; no repeat/cancel") from error
        require(document.get("id") == build_id and document.get("tags") == [expected_tag],
                "Unexpected build identity/tag")
        steps = document.get("steps", [])
        require(len(steps) == 1 and steps[0].get("id") == "pr287-exact-traffic-recovery" and
                steps[0].get("args") == cloud_step_args(expected_code, expected_mode), "Unexpected build execution")
        state = document.get("status")
        if state == "SUCCESS":
            print("PASS: fixed repair buildSUCCESS; signed-in receiving still separate")
            return
        require(state in ("QUEUED", "PENDING", "WORKING"),
                "HOLD_BUILD_OUTCOME: " + str(state) + "; recovery not independently proved by watcher")
        if BUDGET.remaining() <= 26 or BUDGET.counts[0] >= LIMITS["watch"][0]:
            raise LimitError("HOLD_BUILD_OUTCOME: watcher cap reached; build may still run; no retry/cancel")
        time.sleep(min(25, max(0, BUDGET.remaining() - 1)))


# Fixed successor additions. No standalone entry point or external IO at import.
LATE_MODE = "rollback-pr287-6753792"
BUILD_EXECUTOR = "842946218691-compute@developer.gserviceaccount.com"
REPO = "PriorityLexusVB/vehicle-in-need"
WORKFLOW_REF = REPO + "/.github/workflows/build-and-deploy.yml@refs/heads/main"
LIMITS.update(submit=(8, 3, 0, 1, 180), late_pre=(8, 4, 0, 1, 120), late_verify=(5, 4, 1, 0, 180))
PROMOTION_TAG = "pr287-6753792-traffic-repair"
LATE_TAG = "pr287-6753792-late-rollback"
SERVICE_V2 = "projects/" + PROJECT + "/locations/" + REGION + "/services/" + SERVICE


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def positive(value):
    text = str(value)
    require(text.isascii() and text.isdigit() and int(text) > 0, "Positive integer required")
    return int(text)


def fixed_uuid(value):
    require(isinstance(value, str) and str(uuid.UUID(value)) == value, "Canonical UUID required")
    return value


def hex64(value):
    require(isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value), "SHA256 required")
    return value


def v1_fence(document):
    meta = copy.deepcopy(document["metadata"])
    uid = meta.pop("uid")
    generation = positive(meta.pop("generation"))
    for key in ("resourceVersion", "creationTimestamp", "managedFields", "selfLink"):
        meta.pop(key, None)
    # Operation ID is server bookkeeping, not service configuration. Unknown
    # metadata/annotations remain included, so unfamiliar drift fails closed.
    meta.get("annotations", {}).pop("run.googleapis.com/operation-id", None)
    for key in PROVEN_IGNORED_KEYS:
        meta.get("annotations", {}).pop(key, None)
    spec = copy.deepcopy(document["spec"])
    spec.pop("traffic", None)
    require(document["metadata"]["name"] == SERVICE and isinstance(uid, str) and uid, "Service identity missing")
    return {"uid": uid, "generation": generation, "config": digest({"metadata": meta, "spec": spec}),
            "tags": digest(tags(document, "spec"))}


def github_binding():
    require(os.environ.get("GITHUB_REPOSITORY") == REPO and os.environ.get("GITHUB_WORKFLOW_REF") == WORKFLOW_REF,
            "Wrong repository/workflow")
    require(os.environ.get("GITHUB_RUN_ATTEMPT") == "1", "Reruns are not admitted")
    actor = os.environ.get("GITHUB_ACTOR", "")
    require(actor and len(actor) <= 100 and chr(36) not in actor, "Actor required")
    return {"source": os.environ["GITHUB_SHA"], "actor": actor, "repo": REPO, "workflow": WORKFLOW_REF,
            "run": positive(os.environ["GITHUB_RUN_ID"]), "number": positive(os.environ["GITHUB_RUN_NUMBER"])}


def promotion_binding():
    binding = github_binding()
    require_bookkeeping_input()
    current = service()
    admission = json.loads(os.environ["PR287_RECEIVING_ADMISSION"])
    proof = parse_bookkeeping(os.environ["PR287_BOOKKEEPING_PROOF"], current, admission)
    promotion_admission(admission, proof, binding)
    service_guard(current, current, PRIOR, False)
    require(proof["body"]["source"] == binding["source"], "Bookkeeping proof source drift")
    binding.update(schema=2, before=v1_fence(current), late_number=binding["number"] + 1, bookkeeping=proof, main_admission=admission)
    return binding


def check_promotion_preimage(current, binding):
    parse_bookkeeping(canonical(binding.get("bookkeeping", {})).decode(), current, binding.get("main_admission"))
    promotion_admission(binding["main_admission"], binding["bookkeeping"], binding)
    require(binding.get("schema") == 2 and binding.get("repo") == REPO and binding.get("workflow") == WORKFLOW_REF,
            "Promotion admission missing")
    require(v1_fence(current) == binding["before"], "Promotion admission preimage drift")


def check_promotion_postimage(current, binding):
    expected = {**binding["before"], "generation": binding["before"]["generation"] + 3}
    require(v1_fence(current) == expected, "Promotion completion fence not proved; no late admission")


def load_promotion(build_id, code):
    build = json.loads(command(["gcloud", "builds", "describe", fixed_uuid(build_id), "--project=" + PROJECT,
                                "--format=json"], kind="metadata"))
    return build, validate_promotion_build(build, build_id, code)


def parse_receiving(raw):
    require(isinstance(raw, str) and len(raw.encode()) <= 8192, "Receiving admission exceeds8KiB")
    packet = json.loads(raw)
    require(set(packet) == {"body", "sha256"} and digest(packet["body"]) == packet["sha256"], "Admission hash mismatch")
    body = packet["body"]
    required = {"schema", "promotion_build", "source", "actor", "run_number", "uid", "generation", "config", "tags",
                "etag", "received_at", "approved_at", "expires_at", "approval_message", "verifier", "desktop", "mobile"}
    require(set(body) == required and body["schema"] == 2, "Unexpected admission fields")
    fixed_uuid(body["promotion_build"])
    fixed_uuid(body["approval_message"])
    require(body["verifier"] == "01a0e3ba-97b8-7f62-94b7-e8da0ddf98c4", "Existing HOME verifier required")
    require(isinstance(body["etag"], str) and 0 < len(body["etag"]) <= 256 and "\n" not in body["etag"], "Exact etag required")
    hex64(body["config"]); hex64(body["tags"])
    for view in ("desktop", "mobile"):
        item = body[view]
        require(set(item) == {"outcome", "signed_in", "version", "evidence_sha256"}, "Wrong receiving evidence shape")
        require(item["outcome"] in ("PASS", "FAIL") and item["signed_in"] is True and item["version"] == VERSION,
                "Both actual signed-in release checks must be complete; UNKNOWN is not failure")
        hex64(item["evidence_sha256"])
    require(any(body[v]["outcome"] == "FAIL" for v in ("desktop", "mobile")), "Known receivingFAIL required")
    return packet


def admission_time(body, finished):
    end, received, approved, expires = map(stamp_ns, (finished, body["received_at"], body["approved_at"], body["expires_at"]))
    require(end <= received <= approved <= time.time_ns() <= expires and expires - received <= 900000000000,
            "Expired/out-of-order receiving authorization")


def bind_late(packet, build, binding, github=None):
    body = packet["body"]
    require(body["source"] == binding["source"] and body["actor"] == binding["actor"], "Source/actor drift")
    require(binding["repo"] == REPO and binding["workflow"] == WORKFLOW_REF, "Wrong promotion workflow")
    require(positive(body["run_number"]) == positive(binding["late_number"]) == positive(binding["number"]) + 1,
            "Only immediately reserved next workflow run admitted; no slot reset")
    expected = {**binding["before"], "generation": binding["before"]["generation"] + 3}
    require(all(body[k] == expected[k] for k in ("uid", "generation", "config", "tags")), "Receiving fence not promotion postimage")
    admission_time(body, build["finishTime"])
    if github is not None:
        require(github["source"] == body["source"] and github["actor"] == body["actor"] and
                github["number"] == body["run_number"] and github["run"] != binding["run"], "Wrong late run/operator")


# Same fixed Cloud Run service/API and existing CI identity. Token travels only
# through a bounded private stdin pipe, never argv/files/logs. This future direct
# etag PATCH is an explicit new effect for Main review, not a fallback route.
V2_WORKER = r'''
import json, sys, urllib.request, urllib.error
p = sys.stdin.buffer.read(65537)
if len(p) > 65536: raise RuntimeError("Input exceeds64KiB")
r = json.loads(p)
root = "https://run.googleapis.com/v2/"
service = "projects/gen-lang-client-0615287333/locations/us-west1/services/pre-order-dealer-exchange-tracker"
operations = "projects/gen-lang-client-0615287333/locations/us-west1/operations/"
path, method = r["path"], r["method"]
if method == "GET":
    if path != service and not (path.startswith(operations) and len(path[len(operations):]) <= 200 and path[len(operations):] and all(c.isalnum() or c in "-_" for c in path[len(operations):])): raise RuntimeError("Unapproved read")
    data = None
elif method == "PATCH" and path == service:
    b = r["body"]
    if set(b) != {"name", "etag", "traffic"} or b["name"] != service or not b["etag"]: raise RuntimeError("Invalid conditional request")
    positive = [t for t in b["traffic"] if t.get("percent",0)>0]
    if len(positive)!=1 or positive[0].get("revision")!="pre-order-dealer-exchange-tracker-pr286live-20261009" or positive[0].get("percent")!=100: raise RuntimeError("Not fixed rollback")
    if any(set(t)-{"type","revision","percent","tag"} for t in b["traffic"]): raise RuntimeError("Unknown traffic fields")
    data = json.dumps(b,separators=(",",":")).encode()
    path += "?updateMask=traffic"
else: raise RuntimeError("Unapproved operation")
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
headers={"Authorization":"Bearer "+r["token"],"Content-Type":"application/json","Accept-Encoding":"identity"}
if len(json.dumps(headers).encode())+len(root+path)+(len(data) if data else 0)>65536: raise RuntimeError("Request exceeds64KiB")
try:
    with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(root+path,data=data,headers=headers,method=method),timeout=12) as response:
        declared=response.headers.get("Content-Length")
        if declared is not None and (not declared.isdigit() or int(declared)>1048000): raise RuntimeError("Response oversize")
        body=bytearray()
        while True:
            chunk=response.read(min(8192,1048000-len(body)+1))
            if not chunk: break
            if len(body)+len(chunk)>1048000: raise RuntimeError("Response oversize")
            body.extend(chunk)
        value=json.loads(body)
        result={"http":response.status,"body":value}
except urllib.error.HTTPError as error:
    # Error bodies/headers may echo sensitive material; do not return them.
    result={"http":error.code,"body":None}
encoded=json.dumps(result,separators=(",",":")).encode()
if len(encoded)>1048576: raise RuntimeError("Encoded response oversize")
sys.stdout.buffer.write(encoded)
'''


def v2(token, method="GET", body=None, path=SERVICE_V2):
    raw = request_bytes({"token": token, "method": method, "body": body, "path": path})
    result = json.loads(command([sys.executable, "-c", V2_WORKER], kind="mutation" if method == "PATCH" else "metadata", input_bytes=raw))
    if result.get("http") in (400, 401, 403, 404, 409, 412):
        raise RuntimeError("LATE_REFUSED_KNOWN_HTTP_" + str(result["http"]) + "; admission consumed; no retry")
    require(result.get("http") == 200, "HOLD_LATE_OUTCOME_UNKNOWN: API response not admitted; no retry")
    return result["body"]


def v2_config(document):
    copied = copy.deepcopy(document)
    for key in ("name", "uid", "generation", "etag", "createTime", "updateTime", "deleteTime", "expireTime",
                "creator", "lastModifier", "reconciling", "conditions", "terminalCondition", "latestReadyRevision",
                "latestCreatedRevision", "traffic", "trafficStatuses", "uri", "urls", "observedGeneration", "satisfiesPzs"):
        copied.pop(key, None)
    return digest(copied)  # Unknown configuration fields remain included.


def v2_traffic(document, name):
    for scope in ("traffic", "trafficStatuses"):
        rows = document.get(scope, [])
        positive_rows = [r for r in rows if r.get("percent", 0) > 0]
        require(len(positive_rows) == 1 and positive_rows[0].get("revision") == name and
                positive_rows[0]["percent"] == 100 and not positive_rows[0].get("tag"), "V2 traffic drift")


def late_rollback(code):
    global BUDGET, DEADLINE
    start_budget("late_pre")
    started = clock()
    packet = parse_receiving(os.environ["PR287_LATE_ADMISSION"])
    body = packet["body"]
    build, binding = load_promotion(body["promotion_build"], code)
    bind_late(packet, build, binding, json.loads(os.environ["PR287_LATE_RUN"]))
    current = service()
    require(v1_fence(current) == {k: body[k] for k in ("uid", "generation", "config", "tags")}, "Late config/version drift")
    service_guard(current, current, TARGET, False)
    prior = revision(PRIOR)
    require(prior.get("metadata", {}).get("name") == PRIOR, "Rollback revision identity drift")
    containers = prior.get("spec", {}).get("containers", [])
    require(len(containers) == 1, "Rollback container count drift")
    resolved = prior.get("status", {}).get("imageDigest", containers[0].get("image"))
    require(resolved == IMAGE.split("@")[0] + "@" + PRIOR_DIGEST, "Rollback revision digest drift")
    require([e.get("value") for e in containers[0].get("env", []) if e.get("name") == "APP_VERSION"] == [PRIOR_VERSION],
            "Rollback version drift")
    require(all(true_condition(conditions(prior).get(k, {})) for k in ("Ready", "ResourcesAvailable", "ContainerHealthy")), "Prior not healthy")
    active = command(["gcloud", "auth", "list", "--filter=status:ACTIVE", "--format=value(account)"])
    require(active == BUILD_EXECUTOR, "Unexpected active execution account")
    token = command(["gcloud", "auth", "print-access-token"])
    require(0 < len(token) <= 16384 and "\n" not in token, "Invalid in-memory token")
    before = v2(token)
    require(before.get("name") == SERVICE_V2 and before.get("uid") == body["uid"] and
            positive(before.get("generation")) == body["generation"] and before.get("etag") == body["etag"] and
            before.get("reconciling") is False, "Late etag/identity/reconciliation drift")
    v2_traffic(before, TARGET)
    expected_tags = tags(current, "spec")
    require(fixed_tag_map(before["traffic"], True) == expected_tags,
            "V2 tags do not match immutable admission")
    preserved = [copy.deepcopy(t) for t in before["traffic"] if t.get("tag")]
    require(all(not t.get("percent", 0) for t in preserved), "Tagged percent not admitted")
    traffic = [{"type": "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", "revision": PRIOR, "percent": 100}] + preserved
    require(clock() < DEADLINE - 1, "Late preflight budget exhausted")
    # One conditional write only. If transport times out, its remote outcome is
    # UNKNOWN; there is no second PATCH, etag refresh, or reverse promotion.
    try:
        operation = v2(token, "PATCH", {"name": SERVICE_V2, "etag": body["etag"], "traffic": traffic})
        BUDGET = Budget("late_verify", started + 300)
        DEADLINE = BUDGET.deadline
        for attempt in range(3):
            if operation.get("done"):
                break
            require(attempt < 2, "HOLD_LATE_UNKNOWN: operation not terminal; admission consumed")
            name = operation.get("name", "")
            require(name.startswith("projects/" + PROJECT + "/locations/" + REGION + "/operations/"), "Unknown operation")
            time.sleep((8, 12)[attempt])
            operation = v2(token, path=name)
        require(operation.get("done") is True and not operation.get("error"), "HOLD_LATE_UNKNOWN: rollback not proved")
        after = v2(token)
        require(after.get("name") == SERVICE_V2 and after.get("uid") == before["uid"] and positive(after.get("generation")) == body["generation"] + 1 and
                after.get("etag") != body["etag"] and after.get("reconciling") is False, "Late completion version not proved")
        require(after.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED", "Prior serving readiness not proved")
        require(v2_config(after) == v2_config(before), "Post-rollback configuration drift")
        require(fixed_tag_map(after["traffic"], True) == expected_tags, "Post-rollback tags drift")
        v2_traffic(after, PRIOR)
        status(BASE_URL, PRIOR_VERSION)
        print("LATE_ROLLBACK_PROVED: prior100percent; original config/tags preserved; admission consumed")

    except Exception as error:
        raise RuntimeError("HOLD_LATE_NOT_PROVEN: rollback may be applied or UNKNOWN; no retry/reset; " + str(error)) from error


# Reconciliation helpers. Pure evidence producers do not call providers.
SDK_IMAGE = "gcr.io/google.com/cloudsdktool/cloud-sdk"
OPERATIONAL_KEYS = frozenset(("serving.knative.dev/lastModifier", "run.googleapis.com/client-name", "run.googleapis.com/client-version"))
PROVEN_IGNORED_KEYS = frozenset()


def strict_v1_identity(document):
    meta = document["metadata"]
    return digest({"apiVersion": document.get("apiVersion"), "kind": document.get("kind"),
                   "metadata": {k: meta.get(k) for k in ("name", "namespace", "uid", "generation", "resourceVersion")},
                   "annotations": {k: meta.get("annotations", {}).get(k) for k in sorted(OPERATIONAL_KEYS)}})


def scalar_capture_identity(document):
    # This is an actual V2 direct-field selection, NEVER a fabricated V1 record.
    required = {"name", "uid", "generation", "lastModifier", "client", "clientVersion"}
    require(isinstance(document, dict) and set(document) == required, "Exact V2 scalar capture required")
    require(document["name"] == SERVICE_V2 and isinstance(document["uid"], str) and document["uid"],
            "Captured V2 service identity mismatch")
    generation = document["generation"]
    require(isinstance(generation, str) and str(positive(generation)) == generation,
            "Actual V2 generation string required")
    require(all(isinstance(document[k], str) and 0 < len(document[k]) <= 1024 and
                not any(ord(c) < 32 for c in document[k]) for k in ("lastModifier", "client", "clientVersion")),
            "Missing/default/invalid V2 operational scalar refused")
    return digest(document)


def promotion_admission(packet, proof, github=None):
    # Separate Main receipt, delivered in the EXISTING receiving_admission input.
    # Main verifies native provenance; Source pins its exact bytes before dispatch.
    require(isinstance(packet, dict) and set(packet) == {"body", "sha256"} and
            digest(packet["body"]) == packet["sha256"], "Missing Main promotion admission")
    a, p = packet["body"], proof["body"]
    fields = {"kind", "verifier", "source_review_turn", "metadata_review_turn", "approval_message",
              "source", "actor", "run_number", "proof_sha256", "captured_at", "reviewed_at",
              "approved_at", "admitted_at", "expires_at", "attempts"}
    require(set(a) == fields and a["kind"] == "MAIN_PR287_PROMOTION_ADMISSION" and
            a["verifier"] == "01a0e3ba-97b8-7f62-94b7-e8da0ddf98c4", "Exact Main admission required")
    origin = "01a1b7ac-4659-73d1-8752-26baa7029351"
    require(a["source_review_turn"] == origin and fixed_uuid(a["metadata_review_turn"]) != origin and
            a["metadata_review_turn"] == p["main_review_turn"], "Actual bound capture review required")
    fixed_uuid(a["approval_message"])
    require(a["source"] == p["source"] and a["proof_sha256"] == proof["sha256"] and
            a["captured_at"] == p["captured_at"] and type(a["attempts"]) is int and a["attempts"] == 1,
            "Admission capture/source/hash/attempt drift")
    require(isinstance(a["actor"], str) and 0 < len(a["actor"]) <= 100 and
            type(a["run_number"]) is int and a["run_number"] > 0, "Exact dispatch identity required")
    approved, captured, reviewed, admitted, expires = map(stamp_ns,
        (a["approved_at"], a["captured_at"], a["reviewed_at"], a["admitted_at"], a["expires_at"]))
    require(approved <= captured <= reviewed <= admitted <= time.time_ns() <= expires and
            expires - captured <= 900000000000, "Expired/replayed/out-of-order Main capture admission")
    if github is not None:
        require(all(a[k] == github[k] for k in ("source", "actor")) and a["run_number"] == github["number"],
                "Main admission dispatch binding drift")
    return packet


def parse_bookkeeping(raw, document=None, admission=None):
    global PROVEN_IGNORED_KEYS
    PROVEN_IGNORED_KEYS = frozenset()
    require(isinstance(raw, str) and 0 < len(raw.encode()) <= 8192,
            "UNSUPPORTED_NO_VERIFIED_V2_SCALAR_CAPTURE: refuse before mutation")
    packet = json.loads(raw)
    require(set(packet) == {"body", "sha256"} and digest(packet["body"]) == packet["sha256"], "Bookkeeping proof hash mismatch")
    body = packet["body"]
    fields = {"kind", "fixture_sha256", "strict_scalar_sha256", "name", "uid", "generation", "scalars",
              "main_review_turn", "main_verifier", "captured_at", "source", "normalization_keys"}
    require(set(body) == fields and body["kind"] == "REAL_CAPTURED_V2_SCALARS_MAIN_REVIEWED", "Actual V2 scalar review required")
    require(body["main_verifier"] == "01a0e3ba-97b8-7f62-94b7-e8da0ddf98c4", "Existing Main verifier required")
    fixed_uuid(body["main_review_turn"]); hex64(body["fixture_sha256"]); hex64(body["strict_scalar_sha256"])
    promotion_admission(admission, packet)
    require(isinstance(body["normalization_keys"], list) and len(body["normalization_keys"]) == 3 and
            set(body["normalization_keys"]) == OPERATIONAL_KEYS and isinstance(body["scalars"], dict) and
            set(body["scalars"]) == {"lastModifier", "client", "clientVersion"}, "No unproven annotation normalization")
    captured = {"name": body["name"], "uid": body["uid"], "generation": body["generation"], **body["scalars"]}
    require(scalar_capture_identity(captured) == body["strict_scalar_sha256"], "V2 scalar capture hash mismatch")
    require(isinstance(body["source"], str) and len(body["source"]) == 40 and
            all(c in "0123456789abcdef" for c in body["source"]), "Exact source required")
    stamp_ns(body["captured_at"])
    if document is not None:
        # Compare actual V1 values from the ALREADY EXISTING preflight; no extra
        # provider call, exported full service, fabricated annotation or inferred
        # equivalence. UID/generation must bind BOTH real representations.
        meta = document.get("metadata", {})
        require(document.get("apiVersion") == "serving.knative.dev/v1" and document.get("kind") == "Service" and
                meta.get("name") == SERVICE and meta.get("namespace") in (PROJECT, "842946218691") and
                meta.get("uid") == body["uid"] and positive(meta.get("generation")) == positive(body["generation"]),
                "Captured V2/V1 service UID/generation/schema drift")
        actual = meta.get("annotations", {})
        mapping = {"serving.knative.dev/lastModifier": "lastModifier", "run.googleapis.com/client-name": "client",
                   "run.googleapis.com/client-version": "clientVersion"}
        require(isinstance(actual, dict) and all(actual.get(key) == body["scalars"][field] for key, field in mapping.items()),
                "Actual V1 annotation/V2 scalar mismatch; no normalization admitted")
    # Main verifies raw V2 capture/provenance outside this integrity envelope.
    # Build/code/source binding and existing preimage gates enforce actual V1
    # equality before submission and again before the first traffic mutation.
    PROVEN_IGNORED_KEYS = OPERATIONAL_KEYS
    return packet


def fixed_tag_map(rows, v2_shape=False):
    result = {}
    for row in rows:
        if not row.get("tag"): continue
        revision_name = row.get("revision" if v2_shape else "revisionName")
        require(isinstance(revision_name, str) and revision_name and
                row.get("type") != "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST" and
                row.get("latestRevision") is not True, "UNSUPPORTED_TAG_WITHOUT_FIXED_REVISION")
        require(row["tag"] not in result, "Duplicate tag refused")
        result[row["tag"]] = revision_name
    return result


def stamp_ns(value):
    import calendar, re
    from datetime import datetime
    require(isinstance(value, str) and len(value) <= 30, "Bounded RFC3339 timestamp required")
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z", value)
    require(match is not None, "UTC RFC3339 with at most9 fraction digits required")
    date = datetime(*map(int, match.groups()[:6]))
    return calendar.timegm(date.timetuple()) * 1000000000 + int((match[7] or "").ljust(9, "0"))


def runtime_gate():
    require(sys.version_info >= (3, 10) and hasattr(sys, "orig_argv"), "UNSUPPORTED_RUNTIME: Python3.10+ required before mutation")


def validate_promotion_build(build, build_id, code):
    require(build.get("id") == fixed_uuid(build_id) and build.get("status") == "SUCCESS", "Promotion build is not knownSUCCESS")
    require(build.get("tags") == [PROMOTION_TAG], "Wrong promotion tag")
    require(str(build.get("serviceAccount", "")).split("/")[-1] == BUILD_EXECUTOR, "Wrong build execution identity")
    for field in ("source", "sourceProvenance", "secrets", "availableSecrets", "images", "artifacts", "logsBucket", "dependencies", "gitConfig", "substitutions"):
        require(not build.get(field), "Unexpected build authority: " + field)
    options = build.get("options", {})
    defaults = {"logging": "CLOUD_LOGGING_ONLY", "pool": {}, "machineType": "UNSPECIFIED",
                "diskSizeGb": "0", "substitutionOption": "MUST_MATCH", "logStreamingOption": "STREAM_DEFAULT",
                "dynamicSubstitutions": False, "automapSubstitutions": False}
    require(options.get("logging") == "CLOUD_LOGGING_ONLY" and set(options) <= set(defaults), "Unexpected build options")
    require(all(value == defaults[k] or (k == "diskSizeGb" and value == 0) for k, value in options.items()), "Unexpected authority-bearing build option")
    require(build.get("timeout") == "600s", "Unexpected promotion deadline")
    steps = build.get("steps", [])
    require(len(steps) == 1, "Unexpected build steps")
    step = steps[0]
    allowed = {"id", "name", "entrypoint", "args", "env", "timing", "pullTiming", "status", "exitCode"}
    require(set(step) <= allowed and step.get("name") == SDK_IMAGE and step.get("entrypoint") == "python3",
            "Build image/entrypoint or authority drift")
    require(step.get("id") == "pr287-exact-traffic-recovery" and step.get("args") == cloud_step_args(code, "cloud-run-repair"), "Promotion code/mode drift")
    inputs = step.get("env", [])
    require(len(inputs) == 1 and inputs[0].startswith("PR287_PROMOTION_BINDING="), "Immutable promotion input missing")
    binding = json.loads(inputs[0].split("=", 1)[1])
    require(binding.get("schema") == 2 and inputs == ["PR287_PROMOTION_BINDING=" + canonical(binding).decode()], "Build input binding mismatch")
    proof = parse_bookkeeping(canonical(binding.get("bookkeeping", {})).decode(), admission=binding.get("main_admission"))
    promotion_admission(binding["main_admission"], binding["bookkeeping"], binding)
    require(proof["body"]["source"] == binding["source"], "Bookkeeping proof source drift")
    return binding


def bounded_local(path, binary=False):
    with open(path, "rb") as file:
        raw = file.read(MAX_RESPONSE_BYTES + 1)
    require(len(raw) <= MAX_RESPONSE_BYTES, "Local evidence exceeds1MiB")
    return raw if binary else json.loads(raw.decode("utf-8"))


def evidence_file(root, name):
    value = Path(name)
    require(not value.is_absolute() and ".." not in value.parts, "Evidence path outside producer directory")
    path = root / value
    require(not path.is_symlink() and path.resolve().is_relative_to(root.resolve()), "Evidence symlink/namespace refused")
    return path


def produce_receiving_capsule(manifest_path):
    # Pure local mode: captures already exist under the existing owner's output.
    # No subprocess, token, network, CI run, or automatic approval is performed.
    manifest_path = Path(manifest_path).resolve()
    root = manifest_path.parent
    manifest = bounded_local(manifest_path)
    require(set(manifest) == {"promotion", "postimage", "v2_metadata", "receiving", "approval"}, "Wrong producer manifest")
    data = {k: bounded_local(evidence_file(root, name)) for k, name in manifest.items()}
    code = Path(__file__).read_text(encoding="utf-8")
    build = data["promotion"]
    binding = validate_promotion_build(build, build["id"], code)
    post, v2doc = data["postimage"], data["v2_metadata"]["document"]
    receipt, approval = data["receiving"], data["approval"]
    expected = {**binding["before"], "generation": binding["before"]["generation"] + 3}
    require(set(post) == {"body", "sha256"} and digest(post["body"]) == post["sha256"], "Postimage transport hash mismatch")
    require(all(post["body"].get(k) == v for k, v in expected.items()) and
            post["body"]["source"] == binding["source"] and post["body"]["actor"] == binding["actor"] and
            post["body"]["code_sha256"] == hashlib.sha256(code.encode()).hexdigest(), "Producer immutable postimage mismatch")
    allowed_v2 = {"name", "uid", "generation", "etag", "reconciling", "traffic", "trafficStatuses"}
    require(set(v2doc) <= allowed_v2, "Only selected v2 identity/version/traffic metadata admitted")
    require(v2doc.get("name") == SERVICE_V2 and v2doc.get("uid") == expected["uid"] and
            positive(v2doc.get("generation")) == expected["generation"] and isinstance(v2doc.get("etag"), str), "Producer v2 identity/version mismatch")
    v2_traffic(v2doc, TARGET)
    require(digest(fixed_tag_map(v2doc["traffic"], True)) == expected["tags"], "Producer tag representation mismatch")
    require(receipt["verifier"] == "01a0e3ba-97b8-7f62-94b7-e8da0ddf98c4" and receipt["version"] == VERSION, "Actual HOME release receiving required")
    views = {}
    for view in ("desktop", "mobile"):
        item = receipt[view]
        raw = bounded_local(evidence_file(root, item["evidence_file"]), binary=True)
        require(hashlib.sha256(raw).hexdigest() == item["evidence_sha256"], "Receiving evidence bytes changed after review")
        views[view] = {"outcome": item["outcome"], "signed_in": item["signed_in"], "version": item["version"],
                       "evidence_sha256": hashlib.sha256(raw).hexdigest()}
    require(approval["action"] == LATE_MODE and approval["promotion_build"] == build["id"] and
            approval["source"] == binding["source"] and positive(approval["run_number"]) == binding["late_number"] and
            approval["receiving_sha256"] == digest(receipt), "Native approval scope/evidence mismatch")
    captured = stamp_ns(data["v2_metadata"]["captured_at"])
    require(stamp_ns(receipt["received_at"]) <= captured <= stamp_ns(approval["approved_at"]), "Capture must follow UI receiving and precede approval")
    body = {"schema": 2, "promotion_build": build["id"], "source": binding["source"], "actor": binding["actor"],
            "run_number": binding["late_number"], **expected, "etag": v2doc["etag"], "received_at": receipt["received_at"],
            "approved_at": approval["approved_at"], "expires_at": approval["expires_at"], "approval_message": approval["message_id"],
            "verifier": receipt["verifier"], **views}
    packet = {"body": body, "sha256": digest(body)}
    parse_receiving(canonical(packet).decode()); bind_late(packet, build, binding)
    require(len(canonical(packet)) <= 8192, "Producer output exceeds8KiB")
    return packet



def watch():
    try:
        watch_impl()
    except Exception as error:
        raise RuntimeError("HOLD_BUILD_NOT_PROVEN: traffic may be applied or UNKNOWN; no repeat/cancel; " + str(error)) from error

def require_bookkeeping_input():
    raw = os.environ.get("PR287_BOOKKEEPING_PROOF", "")
    require(raw, "UNSUPPORTED_NO_VERIFIED_V2_SCALAR_CAPTURE: refuse before first submission/mutation")
    admission = os.environ.get("PR287_RECEIVING_ADMISSION", "")
    require(isinstance(admission, str) and 0 < len(admission.encode()) <= 8192, "Main promotion admission required before effects")
    return parse_bookkeeping(raw, admission=json.loads(admission))


def emit_postimage(completed, binding):
    # No extra provider, token or status call. Existing completed describe is
    # hashed; service config/env/secret values are never printed.
    code = runtime_inline_code()
    body = {**v1_fence(completed), "source": binding["source"], "actor": binding["actor"],
            "code_sha256": hashlib.sha256(code.encode()).hexdigest()}
    print("PR287_POSTIMAGE_SNAPSHOT=" + canonical({"body": body, "sha256": digest(body)}).decode())


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "produce-receiving-capsule":
        print(canonical(produce_receiving_capsule(sys.argv[2])).decode())
        sys.exit(0)
    require(os.name == "posix", "Prepared runtime is existing LinuxCI only")
    runtime_gate()
    require(len(sys.argv) == 2, "One fixed mode argument required")
    if sys.argv[1] == "submit":
        submit()
    elif sys.argv[1] == "cloud-run-repair":
        repair()
    elif sys.argv[1] == "watch":
        watch()
    elif sys.argv[1] == "cloud-run-late-rollback":
        require("-c" in sys.orig_argv, "Fixed Cloud Build invocation required")
        late_rollback(runtime_inline_code())
    else:
        raise RuntimeError("Unsupported mode")

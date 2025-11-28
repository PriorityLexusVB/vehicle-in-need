#!/usr/bin/env python3
"""
tools/fix_md_tables.py

Normalize markdown table pipes and alignment rows to satisfy MD060 table-column-style.
Usage: python3 tools/fix_md_tables.py [path...]
If no path provided, defaults to **/*.md (excluding node_modules)
"""
import sys
import re
from pathlib import Path
from typing import List


def is_fence(line: str) -> bool:
    """Check if line is a code fence marker."""
    return line.lstrip().startswith("```")


def is_table_row(line: str) -> bool:
    """
    Determine if a line is a markdown table row.
    A table row starts with | (optionally with leading whitespace) and ends with |.
    It should not be a bullet point or other markdown construct.
    """
    stripped = line.strip()
    # Table rows must start and end with |
    if not stripped.startswith("|") or not stripped.endswith("|"):
        return False
    # Must have at least 2 pipes (start and end) for a valid table
    if stripped.count("|") < 2:
        return False
    # Exclude lines that look like list items containing pipes
    if re.match(r'^\s*[-*+]\s', line):
        return False
    return True


def normalize_table_line(line: str) -> str:
    """
    Normalize a table line to have proper spacing around pipes.
    Format: | cell1 | cell2 | cell3 |
    Empty cells: | |
    """
    stripped = line.rstrip("\n")
    # Split on pipes
    parts = stripped.split("|")
    
    # parts[0] is before first pipe (should be empty or whitespace)
    # parts[-1] is after last pipe (should be empty or whitespace)
    # parts[1:-1] are the actual cell contents
    
    if len(parts) < 3:
        # Not a proper table line
        return line
    
    # Check if this is a separator row (contains only dashes and optional colons)
    sep_pattern = re.compile(r'^:?-+:?$')
    inner_parts = parts[1:-1]
    is_separator = all(sep_pattern.match(p.strip()) for p in inner_parts if p.strip())
    
    normalized_cells = []
    for p in inner_parts:
        content = p.strip()
        if is_separator and content:
            # Normalize separator: preserve alignment colons, use 3 dashes
            left_colon = ":" if content.startswith(":") else ""
            right_colon = ":" if content.endswith(":") else ""
            normalized_cells.append(f" {left_colon}---{right_colon} ")
        elif content:
            # Non-empty cell: add spaces around content
            normalized_cells.append(f" {content} ")
        else:
            # Empty cell: single space to maintain style consistency
            normalized_cells.append(" ")
    
    # Rebuild the line
    result = "|" + "|".join(normalized_cells) + "|"
    
    # Preserve the original line ending
    if line.endswith("\n"):
        result += "\n"
    
    return result


def process_file(path: Path) -> bool:
    """Process a single file and normalize table lines."""
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    in_fence = False
    changed = False
    out_lines: List[str] = []
    
    for line in lines:
        # Track code fence state
        if is_fence(line):
            in_fence = not in_fence
            out_lines.append(line)
            continue
        
        # Skip lines inside code fences
        if in_fence:
            out_lines.append(line)
            continue
        
        # Check if this is a table row
        if is_table_row(line):
            try:
                new_line = normalize_table_line(line)
                if new_line != line:
                    changed = True
                out_lines.append(new_line)
            except Exception:
                out_lines.append(line)
        else:
            out_lines.append(line)
    
    if changed:
        path.write_text("".join(out_lines), encoding="utf-8")
    return changed


def gather_files(args: List[str]) -> List[Path]:
    """Gather markdown files to process."""
    if args:
        paths = []
        for p in args:
            ppath = Path(p)
            if ppath.is_file():
                paths.append(ppath)
            else:
                paths.extend(path for path in ppath.rglob("*.md"))
        return sorted(set(paths))
    else:
        # Default: all *.md files excluding node_modules
        all_md = list(Path(".").rglob("*.md"))
        return sorted(p for p in all_md if "node_modules" not in str(p))


def main():
    targets = gather_files(sys.argv[1:])
    if not targets:
        print("No markdown files found.", file=sys.stderr)
        return 1
    any_changed = False
    for f in targets:
        try:
            changed = process_file(f)
            if changed:
                print(f"Updated {f}")
                any_changed = True
        except Exception as e:
            print(f"Error processing {f}: {e}", file=sys.stderr)
            return 2
    if any_changed:
        print("Some files were updated.")
    else:
        print("No changes needed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

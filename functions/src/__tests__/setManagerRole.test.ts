/**
 * Unit tests for setManagerRole Cloud Function
 *
 * These tests verify the input validation and authorization logic of the
 * setManagerRole function using mocks for Firebase Admin SDK.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Type guard for Firebase HttpsError
 */
interface HttpsErrorLike {
  code: string;
  message: string;
}

function isHttpsError(error: unknown): error is HttpsErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as HttpsErrorLike).code === "string" &&
    typeof (error as HttpsErrorLike).message === "string"
  );
}

// Mock Firebase Admin SDK before importing the function
jest.mock("firebase-admin/app", () => ({
  initializeApp: jest.fn(() => ({})),
}));

const mockAuth = {
  getUser: jest.fn(),
  setCustomUserClaims: jest.fn(),
  updateUser: jest.fn(),
};

jest.mock("firebase-admin/auth", () => ({
  getAuth: jest.fn(() => mockAuth),
}));

const mockCollection = jest.fn();
const mockDoc = jest.fn();
const mockGet = jest.fn();
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockAdd = jest.fn();
const mockWhere = jest.fn();

jest.mock("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => ({
    collection: mockCollection,
  })),
  FieldValue: {
    serverTimestamp: jest.fn(() => "SERVER_TIMESTAMP"),
    delete: jest.fn(() => "DELETE_FIELD"),
  },
}));

// Set up mock chain for Firestore
mockCollection.mockImplementation((collectionName: string) => {
  if (collectionName === "adminAuditLogs") {
    return { add: mockAdd };
  }
  return {
    doc: mockDoc,
    where: mockWhere,
  };
});

mockDoc.mockReturnValue({
  get: mockGet,
  update: mockUpdate,
  set: mockSet,
});

mockWhere.mockReturnValue({
  get: jest.fn().mockResolvedValue({ size: 2 }), // Default: 2 managers exist
});

/**
 * Helper to get a fresh function reference after module reset
 * This is necessary because Firebase Functions cache module-level state
 */
function getSetManagerRole() {
  jest.resetModules();
  return require("../index").setManagerRole;
}

describe("setManagerRole", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Authentication", () => {
    it("should throw unauthenticated error when no auth context", async () => {
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "target-uid", isManager: true },
        auth: undefined,
        rawRequest: {} as unknown,
      };

      await expect(setManagerRole.run(mockRequest)).rejects.toMatchObject({
        code: "unauthenticated",
      });
    });
  });

  describe("Input Validation", () => {
    it("should throw invalid-argument when uid is missing", async () => {
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { isManager: true },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      await expect(setManagerRole.run(mockRequest)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });

    it("should throw invalid-argument when isManager is not boolean", async () => {
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "target-uid", isManager: "true" },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      await expect(setManagerRole.run(mockRequest)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });

    it("should throw invalid-argument when uid is empty string", async () => {
      // Setup mock for validateManagerAccess to return valid manager
      mockAuth.getUser.mockResolvedValueOnce({
        email: "caller@test.com",
        customClaims: { isManager: true },
      });
      
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "", isManager: true },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      await expect(setManagerRole.run(mockRequest)).rejects.toMatchObject({
        code: "invalid-argument",
      });
    });
  });

  describe("Authorization", () => {
    it("should throw permission-denied when caller is not a manager", async () => {
      // Clear all mocks and set up the specific return values
      jest.clearAllMocks();
      
      // Mock getUser to return a non-manager (no isManager claim)
      mockAuth.getUser.mockReset();
      mockAuth.getUser.mockResolvedValue({
        email: "caller@test.com",
        customClaims: {}, // No isManager claim
      });
      
      // Mock Firestore get to return isManager: false
      mockGet.mockReset();
      mockGet.mockResolvedValue({
        exists: true,
        data: () => ({ isManager: false }),
      });
      
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "target-uid", isManager: true },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      await expect(setManagerRole.run(mockRequest)).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    it("should throw failed-precondition when trying to modify own role", async () => {
      // Setup: caller is a manager
      mockAuth.getUser.mockResolvedValueOnce({
        email: "caller@test.com",
        customClaims: { isManager: true },
      });
      
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "caller-uid", isManager: false },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      try {
        await setManagerRole.run(mockRequest);
        throw new Error("Expected function to throw");
      } catch (error) {
        expect(isHttpsError(error)).toBe(true);
        if (isHttpsError(error)) {
          expect(error.code).toBe("failed-precondition");
          expect(error.message).toContain("your own manager status");
        }
      }
    });
  });

  describe("Last Manager Protection", () => {
    it("should throw failed-precondition when demoting the last manager", async () => {
      // Setup: caller is a manager
      mockAuth.getUser
        .mockResolvedValueOnce({
          // Caller validation
          email: "caller@test.com",
          customClaims: { isManager: true },
        })
        .mockResolvedValueOnce({
          // Target user lookup
          email: "target@test.com",
          customClaims: { isManager: true },
        });

      // Target user doc
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ isManager: true }),
      });

      // Only 1 manager exists
      mockWhere.mockReturnValueOnce({
        get: jest.fn().mockResolvedValue({ size: 1 }),
      });
      
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "target-uid", isManager: false },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      try {
        await setManagerRole.run(mockRequest);
        throw new Error("Expected function to throw");
      } catch (error) {
        expect(isHttpsError(error)).toBe(true);
        if (isHttpsError(error)) {
          expect(error.code).toBe("failed-precondition");
          expect(error.message).toContain("last manager");
        }
      }
    });
  });

  describe("Successful Operations", () => {
    it("should successfully promote a user to manager", async () => {
      // Setup: caller is a manager
      mockAuth.getUser
        .mockResolvedValueOnce({
          // Caller validation
          email: "caller@test.com",
          customClaims: { isManager: true },
        })
        .mockResolvedValueOnce({
          // Target user lookup
          email: "target@test.com",
          displayName: "Target User",
          customClaims: {},
        });

      // Target user doc exists
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({ isManager: false }),
      });

      mockAuth.setCustomUserClaims.mockResolvedValueOnce(undefined);
      mockUpdate.mockResolvedValueOnce(undefined);
      mockAdd.mockResolvedValueOnce({ id: "audit-log-id" });
      
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "target-uid", isManager: true },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      const result = await setManagerRole.run(mockRequest);

      expect(result).toEqual({
        success: true,
        uid: "target-uid",
        isManager: true,
      });

      expect(mockAuth.setCustomUserClaims).toHaveBeenCalledWith("target-uid", {
        isManager: true,
      });
      expect(mockUpdate).toHaveBeenCalledWith({ isManager: true });
    });

    it("should create user document if it doesn't exist when setting manager role", async () => {
      // Setup: caller is a manager
      mockAuth.getUser
        .mockResolvedValueOnce({
          // Caller validation
          email: "caller@test.com",
          customClaims: { isManager: true },
        })
        .mockResolvedValueOnce({
          // Target user lookup
          email: "target@test.com",
          displayName: "Target User",
          customClaims: {},
        });

      // Target user doc doesn't exist
      mockGet.mockResolvedValueOnce({
        exists: false,
      });

      mockAuth.setCustomUserClaims.mockResolvedValueOnce(undefined);
      mockSet.mockResolvedValueOnce(undefined);
      mockAdd.mockResolvedValueOnce({ id: "audit-log-id" });
      
      const setManagerRole = getSetManagerRole();
      
      const mockRequest = {
        data: { uid: "target-uid", isManager: true },
        auth: { uid: "caller-uid" },
        rawRequest: {} as unknown,
      };

      const result = await setManagerRole.run(mockRequest);

      expect(result).toEqual({
        success: true,
        uid: "target-uid",
        isManager: true,
      });

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          uid: "target-uid",
          email: "target@test.com",
          displayName: "Target User",
          isManager: true,
        }),
        { merge: true }
      );
    });
  });
});

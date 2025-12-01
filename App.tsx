import React, { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  Timestamp,
  FirestoreError,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db, auth } from "./services/firebase";
import { Order, OrderStatus, AppUser } from "./types";
import { MANAGER_EMAILS, USERS_COLLECTION, isSecuredStatus, isActiveStatus } from "./constants";
import Header from "./components/Header";
import OrderForm from "./components/OrderForm";
import OrderList from "./components/OrderList";
import Login from "./components/Login";
import LoadingSpinner from "./components/LoadingSpinner";
import SettingsPage from "./components/SettingsPage";
import DashboardStats from "./components/DashboardStats";
import ProtectedRoute from "./components/ProtectedRoute";
import ZeroManagerWarning from "./components/ZeroManagerWarning";
import { PlusIcon } from "./components/icons/PlusIcon";
import { CloseIcon } from "./components/icons/CloseIcon";
import { useRegisterSW } from "virtual:pwa-register/react";

// Type guard to verify if an error is a FirestoreError.
// Checks for FirestoreError-specific properties to distinguish from generic errors.
const isFirestoreError = (error: unknown): error is FirestoreError => {
  if (typeof error !== 'object' || error === null) return false;
  const err = error as Record<string, unknown>;
  // FirestoreError has code (string), message (string), and name properties
  return (
    typeof err.code === 'string' &&
    typeof err.message === 'string' &&
    typeof err.name === 'string'
  );
};

// Helper function to map Firestore QuerySnapshot documents to Order objects.
// Defined outside component to avoid recreation on every render.
const mapDocsToOrders = (querySnapshot: QuerySnapshot<DocumentData>): Order[] => {
  return querySnapshot.docs.map(
    (docSnapshot) => ({
      ...docSnapshot.data(),
      id: docSnapshot.id,
    } as Order)
  );
};

// Declare version globals
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const App: React.FC = () => {
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOrderFormVisible, setIsOrderFormVisible] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalActive: 0,
    awaitingAction: 0,
    securedLast30Days: 0,
  });

  // Track if we've already shown the fallback warning
  const fallbackWarningShown = useRef(false);

  // Service Worker registration with update notification
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log("SW Registered: " + r);
    },
    onRegisterError(error) {
      console.log("SW registration error", error);
    },
  });

  // Log version on load
  useEffect(() => {
    console.log(`App Version: ${__APP_VERSION__}`);
    console.log(`Build Time: ${__BUILD_TIME__}`);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      try {
        // Only process users with valid Priority Automotive email addresses
        if (authUser && authUser.email?.endsWith("@priorityautomotive.com")) {
          // At this point, authUser.email is guaranteed to be a non-null string
          // because the optional chaining + endsWith check ensures it
          const userEmail = authUser.email; // Type narrowing for clarity
          const userDocRef = doc(db, USERS_COLLECTION, authUser.uid);

          console.log(
            "%c👤 Auth Flow - User Document Fetch",
            "color: #10b981; font-weight: bold;"
          );
          console.log("User email:", userEmail);
          console.log("User UID:", authUser.uid);

          let userDoc;
          try {
            userDoc = await getDoc(userDocRef);
            console.log("User document exists:", userDoc.exists());
          } catch (firestoreError) {
            console.error(
              "%c❌ Firestore Error - Failed to fetch user document",
              "color: #ef4444; font-weight: bold;",
              firestoreError
            );
            // Create a minimal user object from auth data only - always set isManager to false
            // since we can't verify their status. They can still use non-manager features.
            const fallbackUser: AppUser = {
              uid: authUser.uid,
              email: userEmail,
              displayName: authUser.displayName,
              isManager: false,
            };
            setUser(fallbackUser);
            setIsLoading(false);
            return;
          }

          let appUser: AppUser;

          if (!userDoc.exists()) {
            // NEW USER: First-time login - always create with isManager: false.
            // This is required by Firestore security rules which prevent self-escalation.
            // Users must be promoted to manager by an existing manager via the Settings page
            // or by running the set-manager-custom-claims.mjs admin script.
            console.log(
              "NEW USER - Creating user document with isManager: false"
            );
            
            // Check if user is in MANAGER_EMAILS for informational logging
            const shouldBeManager = MANAGER_EMAILS.includes(
              userEmail.toLowerCase()
            );
            if (shouldBeManager) {
              console.log(
                "%c📋 User is in MANAGER_EMAILS list",
                "color: #f59e0b; font-weight: bold;"
              );
              console.log(
                "To grant manager permissions, an existing manager must promote this user via Settings, " +
                "or run: npm run seed:managers:apply -- --emails " + userEmail
              );
            }

            // Create user document with isManager: false (required by security rules)
            const newUserDoc = {
              uid: authUser.uid,
              email: userEmail,
              displayName: authUser.displayName,
              isManager: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };
            
            appUser = {
              uid: authUser.uid,
              email: userEmail,
              displayName: authUser.displayName,
              isManager: false,
            };

            try {
              await setDoc(userDocRef, newUserDoc);
              console.log(
                "%c✅ Created new user document successfully",
                "color: #10b981; font-weight: bold;"
              );
            } catch (firestoreError) {
              console.error(
                "%c❌ Firestore Error - Failed to create user document",
                "color: #ef4444; font-weight: bold;",
                firestoreError
              );
              // Continue with the in-memory user object - they can still use non-manager features
              console.warn("Proceeding with in-memory user object");
            }
          } else {
            // EXISTING USER: Firestore is the single source of truth for the manager role.
            // Changes made via Settings page will persist because we read from Firestore, not MANAGER_EMAILS.
            const existingData = userDoc.data();
            let isManager = existingData.isManager;
            console.log(
              "EXISTING USER - Firestore document data:",
              existingData
            );
            console.log("Fetched isManager from Firestore:", isManager);

            // One-time migration for older user documents that might not have the isManager field.
            // Checking for non-boolean handles undefined, null, and any incorrectly stored values.
            // NOTE: We can only set isManager to false here due to security rules.
            // Manager promotion must be done by an existing manager via Settings or admin scripts.
            if (typeof isManager !== "boolean") {
              isManager = false;
              console.log(
                "MIGRATION - isManager was not boolean, setting to false"
              );
              // Check if user should be a manager for informational logging
              if (MANAGER_EMAILS.includes(userEmail.toLowerCase())) {
                console.log(
                  "%c📋 User is in MANAGER_EMAILS list but cannot self-elevate",
                  "color: #f59e0b; font-weight: bold;"
                );
                console.log(
                  "To grant manager permissions, an existing manager must promote this user via Settings, " +
                  "or run: npm run seed:managers:apply -- --emails " + userEmail
                );
              }
            }

            // Update displayName if it changed and set updatedAt timestamp
            const updates: Record<string, unknown> = {
              updatedAt: serverTimestamp(),
            };
            
            // Update displayName if it changed from Firebase Auth
            if (existingData.displayName !== authUser.displayName) {
              updates.displayName = authUser.displayName;
            }

            try {
              await updateDoc(userDocRef, updates);
              console.log("Updated user document with updatedAt timestamp");
            } catch (firestoreError) {
              // This is non-critical - user can still use the app
              // Log detailed info to help diagnose permission issues
              console.warn(
                "%c⚠️ Could not update user document timestamp",
                "color: #f59e0b; font-weight: bold;"
              );
              console.warn("Error details:", firestoreError);
              console.warn("Update attempted:", JSON.stringify(updates));
              console.warn("User document fields:", Object.keys(existingData));
              console.warn("User isManager:", isManager);
              console.warn(
                "If this is a permission error, ensure Firestore rules are deployed:",
                "firebase deploy --only firestore:rules"
              );
              console.warn(
                "For managers, sync custom claims:",
                "npm run seed:managers:apply -- --emails " + userEmail
              );
            }

            appUser = {
              uid: authUser.uid,
              email: userEmail,
              displayName: authUser.displayName,
              isManager: isManager, // This value came from Firestore, ensuring Settings changes persist.
            };
          }

          console.log(
            "%c✅ Auth Complete - Final AppUser State",
            "color: #10b981; font-weight: bold;"
          );
          console.log("isManager:", appUser.isManager);
          console.log("displayName:", appUser.displayName);
          console.log("email:", appUser.email);

          // Development-only: Log admin nav render intent
          if (import.meta.env.DEV) {
            console.log(
              "%c🔍 Admin Nav Render Check",
              "color: #8b5cf6; font-weight: bold;"
            );
            console.log(
              `Will render admin navigation: ${
                appUser.isManager ? "YES" : "NO"
              }`
            );
            if (appUser.isManager) {
              console.log("✓ Manager user should see:");
              console.log(
                "  - Navigation pill with Dashboard/User Management links"
              );
              console.log("  - Gear icon link to /#/admin in header");
              console.log("  - Active orders count");
            } else {
              console.log(
                "✗ Non-manager user will NOT see admin navigation elements"
              );
            }
          }

          setUser(appUser);
        } else {
          if (authUser) {
            // Domain restriction: Only @priorityautomotive.com emails are allowed.
            console.log(
              "%c⛔ Domain Restriction - Signing out user",
              "color: #f59e0b; font-weight: bold;"
            );
            console.log("User email:", authUser.email);
            await signOut(auth);
            alert(
              "Access denied. Please use a '@priorityautomotive.com' email address."
            );
          }
          setUser(null);
        }
      } catch (error) {
        console.error(
          "%c❌ Critical Auth Error",
          "color: #ef4444; font-weight: bold;",
          error
        );
        // On critical error, sign out and show error
        setUser(null);
        alert(
          "An unexpected error occurred during sign-in. Please try again or contact support if this persists."
        );
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Helper function to process orders data, update stats, and clear permission errors.
  // This is used both for successful data loads and as part of the error recovery mechanism.
  // Also resets fallbackWarningShown so users are notified if permissions fail again.
  const processOrdersData = useCallback((ordersData: Order[]) => {
    setOrders(ordersData);
    // Clear any previous permission errors when data loads successfully
    setPermissionError(null);
    // Reset fallback warning so user is notified if permissions fail again
    fallbackWarningShown.current = false;

    // Calculate stats using isSecuredStatus and isActiveStatus for consistency
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newStats = ordersData.reduce(
      (acc, order) => {
        // Count active orders (not secured)
        if (isActiveStatus(order.status)) {
          acc.totalActive++;
        }
        // Count orders awaiting action (Factory Order, Locate, Dealer Exchange)
        if (
          [
            OrderStatus.FactoryOrder,
            OrderStatus.Locate,
            OrderStatus.DealerExchange,
          ].includes(order.status)
        ) {
          acc.awaitingAction++;
        }
        // Count secured orders in last 30 days (includes legacy Received/Delivered)
        const createdAtDate = (order.createdAt as Timestamp)?.toDate();
        if (
          isSecuredStatus(order.status) &&
          createdAtDate &&
          createdAtDate > thirtyDaysAgo
        ) {
          acc.securedLast30Days++;
        }
        return acc;
      },
      {
        totalActive: 0,
        awaitingAction: 0,
        securedLast30Days: 0,
      }
    );
    setStats(newStats);
  }, []);


  useEffect(() => {
    if (!user) {
      // If user is not logged in, reset state
      Promise.resolve().then(() => {
        setOrders([]);
        setAllUsers([]);
        setPermissionError(null);
        setStats({
          totalActive: 0,
          awaitingAction: 0,
          securedLast30Days: 0,
        });
      });
      // Reset fallback warning when user logs out
      fallbackWarningShown.current = false;
      return;
    }

    let unsubscribeOrders: (() => void) | undefined;
    let unsubscribeOrdersFallback: (() => void) | undefined;
    let unsubscribeUsers: (() => void) | undefined;

    // Determine the appropriate query based on user role
    // For managers: First try to fetch ALL orders
    // For non-managers: Only fetch their own orders
    const isManagerQuery = user.isManager;
    
    // Query for user's own orders (used as fallback for managers or primary for non-managers)
    const userOwnOrdersQuery = query(
      collection(db, "orders"),
      where("createdByUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    // Query for all orders (manager-only)
    const allOrdersQuery = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc")
    );

    // Helper to log permission error details for debugging
    const logPermissionErrorDetails = (queryType: 'manager' | 'user') => {
      console.error(
        "%c🔐 Permission Error Details",
        "color: #f59e0b; font-weight: bold;"
      );
      console.error("User UID:", user.uid);
      console.error("User email:", user.email);
      console.error("User isManager (app state):", user.isManager);
      console.error("Query type attempted:", queryType);
    };

    // Helper to set up fallback listener for manager's own orders.
    // Called when a manager query fails due to missing custom claims.
    const setupManagerFallback = () => {
      // Unsubscribe from manager query before setting up fallback to prevent race conditions
      unsubscribeOrders?.();

      console.warn(
        "%c⚠️ Manager permissions issue - falling back to user's own orders",
        "color: #f59e0b; font-weight: bold;"
      );
      console.info(
        "To resolve: Run the set-manager-custom-claims.mjs script to sync custom claims"
      );
      
      // Show user-facing warning only once per session
      if (!fallbackWarningShown.current) {
        fallbackWarningShown.current = true;
        setPermissionError(
          "Unable to load all orders. Showing only your orders. Please contact an administrator to update your permissions."
        );
      }
      
      // Set up fallback listener for user's own orders
      unsubscribeOrdersFallback = onSnapshot(
        userOwnOrdersQuery,
        (querySnapshot) => {
          const ordersData = mapDocsToOrders(querySnapshot);
          processOrdersData(ordersData);
        },
        (fallbackError) => {
          console.error(
            "%c❌ Critical: Fallback orders query also failed",
            "color: #ef4444; font-weight: bold;",
            fallbackError
          );
          setPermissionError(
            "Unable to load orders. Please try refreshing the page or contact support."
          );
        }
      );
    };

    // Error handler for orders query.
    // Handles different error scenarios:
    // - permission-denied for managers: Falls back to user's own orders (likely missing custom claims)
    // - permission-denied for non-managers: Shows permission error message
    // - Other errors (network, etc.): Shows generic error message
    const handleOrdersError = (error: unknown, queryType: 'manager' | 'user') => {
      // Log error details for debugging
      console.error(
        `%c❌ Error fetching orders (${queryType} query)`,
        "color: #ef4444; font-weight: bold;"
      );
      
      // Verify error is a FirestoreError before accessing its properties
      if (!isFirestoreError(error)) {
        console.error('Unexpected error type:', error);
        setPermissionError('An unexpected error occurred. Please try refreshing the page.');
        return;
      }

      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      
      if (error.code === "permission-denied") {
        logPermissionErrorDetails(queryType);
        
        // For managers with Firestore isManager=true but missing custom claims,
        // fall back to querying only their own orders instead of failing completely
        if (queryType === 'manager' && user.isManager) {
          setupManagerFallback();
        } else {
          // Non-manager permission error or other permission issues
          setPermissionError(
            "Unable to load orders due to a permissions error. Please try refreshing the page or contact support."
          );
        }
      } else {
        // Network or other non-permission errors
        setPermissionError(
          "Unable to load orders. Please check your internet connection and try again."
        );
      }
    };

    // Set up the primary orders listener
    if (isManagerQuery) {
      // Manager: Try to fetch all orders first
      unsubscribeOrders = onSnapshot(
        allOrdersQuery,
        (querySnapshot) => {
          const ordersData = mapDocsToOrders(querySnapshot);
          processOrdersData(ordersData);
        },
        (error) => handleOrdersError(error, 'manager')
      );
    } else {
      // Non-manager: Only fetch their own orders
      unsubscribeOrders = onSnapshot(
        userOwnOrdersQuery,
        (querySnapshot) => {
          const ordersData = mapDocsToOrders(querySnapshot);
          processOrdersData(ordersData);
        },
        (error) => handleOrdersError(error, 'user')
      );
    }

    // Fetch all users (only for managers)
    if (user.isManager) {
      const usersQuery = query(
        collection(db, USERS_COLLECTION),
        orderBy("displayName", "asc")
      );
      unsubscribeUsers = onSnapshot(
        usersQuery,
        (querySnapshot) => {
          const usersData: AppUser[] = querySnapshot.docs.map(
            (docSnapshot) => docSnapshot.data() as AppUser
          );
          setAllUsers(usersData);
        },
        (error) => {
          // Verify error is a FirestoreError before accessing its properties
          if (!isFirestoreError(error)) {
            console.error('Unexpected error type:', error);
            return;
          }
          
          console.error(
            "%c❌ Error fetching users from Firestore",
            "color: #ef4444; font-weight: bold;"
          );
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
          
          if (error.code === "permission-denied") {
            console.error(
              "%c🔐 Users Permission Error - Manager may need custom claims",
              "color: #f59e0b; font-weight: bold;"
            );
            // Don't show a separate error - the orders error message is enough
            // Just log for debugging
          }
        }
      );
    }

    return () => {
      unsubscribeOrders?.();
      unsubscribeOrdersFallback?.();
      unsubscribeUsers?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- processOrdersData is stable (useCallback with []), mapDocsToOrders/isFirestoreError are module-level functions
  }, [user]);

  const handleAddOrder = useCallback(
    async (newOrder: Omit<Order, "id">): Promise<boolean> => {
      // Validate user is authenticated and has required fields
      if (!user?.uid || !user?.email) {
        console.error("Cannot create order: User not authenticated or missing required fields", {
          hasUser: !!user,
          hasUid: !!user?.uid,
          hasEmail: !!user?.email,
        });
        alert("Cannot create order: You must be logged in. Please refresh the page and try again.");
        return false;
      }

      // Additional check: Ensure Firebase auth current user matches our user state
      const currentAuthUser = auth.currentUser;
      if (!currentAuthUser) {
        console.error("Cannot create order: Firebase auth.currentUser is null");
        alert("Authentication error: Please refresh the page and try again.");
        return false;
      }

      // Verify the auth user email matches our app user email
      if (currentAuthUser.email !== user.email) {
        console.error("Cannot create order: Auth email mismatch", {
          authEmail: currentAuthUser.email,
          appEmail: user.email,
        });
        alert("Authentication sync error: Please refresh the page and try again.");
        return false;
      }

      try {
        const orderPayload = { ...newOrder };
        Object.keys(orderPayload).forEach((key) => {
          if (orderPayload[key as keyof typeof orderPayload] === undefined) {
            delete orderPayload[key as keyof typeof orderPayload];
          }
        });

        // Prepare the final document to be written to Firestore
        const finalOrder = {
          ...orderPayload,
          createdAt: serverTimestamp(),
          createdByUid: user.uid,
          createdByEmail: user.email,
        };

        // Debug: Log the exact payload being sent (development only to avoid production overhead)
        if (import.meta.env.DEV) {
          console.log("%c📝 Creating Order - Payload Details", "color: #3b82f6; font-weight: bold;");
          console.log("User authenticated:", !!user.uid);
          console.log("Email present:", !!user.email);
          console.log("Auth current user synced:", !!currentAuthUser.uid);
          console.log("Email match:", currentAuthUser.email === user.email);
          console.log("Order Status:", orderPayload.status);
          console.log("Payload has createdAt:", 'createdAt' in finalOrder);
          console.log("Payload keys (count):", Object.keys(finalOrder).length);
          console.log("Full payload (createdAt will be server timestamp):", {
            ...finalOrder,
            createdAt: "[SERVER_TIMESTAMP]"
          });
        }

        await addDoc(collection(db, "orders"), finalOrder);
        
        if (import.meta.env.DEV) {
          console.log("%c✅ Order created successfully", "color: #10b981; font-weight: bold;");
        }
        return true;
      } catch (error) {
        console.error("Error adding order: ", error);
        
        // Provide more specific error messages based on the error
        if (error instanceof Error) {
          if (error.message.includes("Missing or insufficient permissions")) {
            alert("Failed to add order: Permission denied. Please ensure you're logged in and try again.");
          } else {
            // Log full error for debugging but show generic message to user
            console.error("Detailed error:", error.message);
            alert("Failed to add order. Please try again or contact support if the issue persists.");
          }
        } else {
          alert("Failed to add order. Please try again.");
        }
        return false;
      }
    },
    [user]
  );

  const handleAddOrderAndCloseForm = useCallback(
    async (newOrder: Omit<Order, "id">): Promise<boolean> => {
      const success = await handleAddOrder(newOrder);
      if (success) {
        setIsOrderFormVisible(false);
      }
      return success;
    },
    [handleAddOrder]
  );

  const handleUpdateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      if (!user?.isManager) return; // Security check
      try {
        const orderDocRef = doc(db, "orders", orderId);
        await updateDoc(orderDocRef, { status });
      } catch (error) {
        console.error("Error updating order status: ", error);
        alert("Failed to update status. Please try again.");
      }
    },
    [user]
  );

  const handleDeleteOrder = useCallback(
    async (orderId: string) => {
      if (!user?.isManager) return; // Security check
      if (
        window.confirm(
          "Are you sure you want to delete this order? This action cannot be undone."
        )
      ) {
        try {
          await deleteDoc(doc(db, "orders", orderId));
        } catch (error) {
          console.error("Error deleting order: ", error);
          alert("Failed to delete order. Please try again.");
        }
      }
    },
    [user]
  );

  const handleUpdateUserRole = useCallback(
    async (uid: string, isManager: boolean) => {
      if (!user?.isManager || user.uid === uid) return; // Security check
      // Optimistically update local state after backend function succeeds
      // Called from SettingsPage after successful backend update
      setAllUsers(prev => 
        prev.map(u => u.uid === uid ? { ...u, isManager } : u)
      );
    },
    [user]
  );

  const handleUserStatusChange = useCallback(
    (uid: string, isActive: boolean) => {
      if (!user?.isManager || user.uid === uid) return; // Security check
      // Update allUsers state to reflect the change
      setAllUsers(prev => 
        prev.map(u => u.uid === uid ? { ...u, isActive } : u)
      );
    },
    [user]
  );

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      {needRefresh && (
        <div className="fixed top-0 left-0 right-0 bg-sky-600 text-white py-3 px-4 z-50 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">
            A new version is available!
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => updateServiceWorker(true)}
              className="bg-white text-sky-600 px-4 py-1 rounded-md text-sm font-semibold hover:bg-slate-100 transition-colors"
            >
              Reload
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="text-white px-3 py-1 text-sm hover:bg-sky-700 rounded-md transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <Header
        user={user}
        totalOrders={stats.totalActive}
        onLogout={handleLogout}
        currentPath={location.pathname}
      />
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <ZeroManagerWarning
          hasManagers={allUsers.some((u) => u.isManager)}
          isCurrentUserManager={user.isManager}
        />
        {permissionError && (
          <div 
            role="alert"
            aria-live="polite"
            className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-3"
          >
            <svg
              className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-amber-800">{permissionError}</p>
            </div>
            <button
              onClick={() => setPermissionError(null)}
              className="text-amber-500 hover:text-amber-700 transition-colors"
              aria-label="Dismiss warning"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              user.isManager ? (
                <div>
                  <DashboardStats {...stats} />
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">
                      All Orders
                    </h2>
                    <button
                      onClick={() => setIsOrderFormVisible((prev) => !prev)}
                      className={`flex items-center gap-2 text-white font-bold py-2 px-5 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-0.5 ${
                        isOrderFormVisible
                          ? "bg-slate-600 hover:bg-slate-700"
                          : "bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700"
                      }`}
                    >
                      {isOrderFormVisible ? (
                        <>
                          <CloseIcon className="w-5 h-5" />
                          <span>Cancel</span>
                        </>
                      ) : (
                        <>
                          <PlusIcon className="w-5 h-5" />
                          <span>Add New Order</span>
                        </>
                      )}
                    </button>
                  </div>
                  {isOrderFormVisible && (
                    <div className="mb-8 animate-fade-in-down">
                      <OrderForm
                        onAddOrder={handleAddOrderAndCloseForm}
                        currentUser={user}
                      />
                    </div>
                  )}
                  <OrderList
                    orders={orders}
                    onUpdateStatus={handleUpdateOrderStatus}
                    onDeleteOrder={handleDeleteOrder}
                    currentUser={user}
                  />
                </div>
              ) : (
                <div>
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-slate-800">
                      Submit a New Vehicle Request
                    </h2>
                    <p className="text-slate-500 mt-1">
                      Fill out the form below to create a new pre-order or
                      dealer exchange request.
                    </p>
                  </div>
                  <div className="flex justify-center mb-8">
                    <div className="w-full max-w-3xl">
                      <OrderForm
                        onAddOrder={handleAddOrder}
                        currentUser={user}
                      />
                    </div>
                  </div>
                  <div className="mt-12">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">
                      Your Orders
                    </h2>
                    <OrderList
                      orders={orders}
                      onUpdateStatus={handleUpdateOrderStatus}
                      onDeleteOrder={handleDeleteOrder}
                      currentUser={user}
                    />
                  </div>
                </div>
              )
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={user}>
                {/* user is guaranteed to be non-null here due to ProtectedRoute guard */}
                <SettingsPage
                  users={allUsers}
                  currentUser={user!}
                  onUpdateUserRole={handleUpdateUserRole}
                  onUserStatusChange={handleUserStatusChange}
                />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
};

export default App;

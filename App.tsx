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
} from "firebase/firestore";
import { db, auth } from "./services/firebase";
import { Order, OrderStatus, AppUser, VehicleOption } from "./types";
import { MANAGER_EMAILS, USERS_COLLECTION, VEHICLE_OPTIONS_COLLECTION } from "./constants";
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

// Declare version globals
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const App: React.FC = () => {
  const location = useLocation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOrderFormVisible, setIsOrderFormVisible] = useState(false);
  const [stats, setStats] = useState({
    totalActive: 0,
    awaitingAction: 0,
    readyForDelivery: 0,
    deliveredLast30Days: 0,
  });

  // Track logged elevations to prevent duplicate logging
  const loggedElevations = useRef<Set<string>>(new Set());

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
        if (authUser && authUser.email?.endsWith("@priorityautomotive.com")) {
          const userDocRef = doc(db, USERS_COLLECTION, authUser.uid);

          console.log(
            "%c👤 Auth Flow - User Document Fetch",
            "color: #10b981; font-weight: bold;"
          );
          console.log("User email:", authUser.email);
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
            // Continue with auth info but log the error
            alert(
              "Warning: Could not load user profile. You may have limited access. Please refresh the page or contact support if this persists."
            );
            // Create a minimal user object from auth data only
            const fallbackUser: AppUser = {
              uid: authUser.uid,
              email: authUser.email,
              displayName: authUser.displayName,
              isManager: MANAGER_EMAILS.includes(authUser.email!.toLowerCase()),
            };
            setUser(fallbackUser);
            setIsLoading(false);
            return;
          }

          let appUser: AppUser;

          if (!userDoc.exists()) {
            // NEW USER: First-time login - seed isManager from MANAGER_EMAILS constant.
            // IMPORTANT: MANAGER_EMAILS is ONLY used for initial seeding, not on subsequent logins.
            const isManager = MANAGER_EMAILS.includes(
              authUser.email!.toLowerCase()
            );
            console.log(
              "NEW USER - Seeding isManager from MANAGER_EMAILS:",
              isManager
            );
            appUser = {
              uid: authUser.uid,
              email: authUser.email,
              displayName: authUser.displayName,
              isManager: isManager,
            };

            try {
              await setDoc(userDocRef, appUser);
              console.log(
                "Created new user document with isManager:",
                isManager
              );
            } catch (firestoreError) {
              console.error(
                "%c❌ Firestore Error - Failed to create user document",
                "color: #ef4444; font-weight: bold;",
                firestoreError
              );
              // Continue with the user object even if Firestore write failed
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
            if (typeof isManager !== "boolean") {
              isManager = MANAGER_EMAILS.includes(
                authUser.email!.toLowerCase()
              );
              console.log(
                "MIGRATION - isManager was not boolean, setting to:",
                isManager
              );
              // Write the migrated value to Firestore so it persists.
              try {
                await updateDoc(userDocRef, { isManager });
              } catch (firestoreError) {
                console.error(
                  "%c❌ Firestore Error - Failed to update isManager field",
                  "color: #ef4444; font-weight: bold;",
                  firestoreError
                );
                // Continue with the migrated value even if write failed
              }
            } else if (
              !isManager &&
              MANAGER_EMAILS.includes(authUser.email!.toLowerCase())
            ) {
              // Persistent elevation: if an existing user is in MANAGER_EMAILS but not a manager yet,
              // elevate them now. This keeps MANAGER_EMAILS as an allow-list for upgrades only.
              // Log only once per user to avoid duplicate logs on re-renders
              const elevationKey = `${authUser.uid}-elevation`;
              if (!loggedElevations.current.has(elevationKey)) {
                console.log(
                  `[ROLE-ELEVATION] email=${authUser.email} uid=${authUser.uid} elevated=true`
                );
                loggedElevations.current.add(elevationKey);
              }
              isManager = true;
              try {
                await updateDoc(userDocRef, { isManager: true });
              } catch (firestoreError) {
                console.error(
                  "%c❌ Firestore Error - Failed to elevate user to manager",
                  "color: #ef4444; font-weight: bold;",
                  firestoreError
                );
                // Continue with the elevated value even if write failed
              }
            }

            appUser = {
              uid: authUser.uid,
              email: authUser.email,
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

  useEffect(() => {
    if (!user) {
      // If user is not logged in, reset state
      Promise.resolve().then(() => {
        setOrders([]);
        setAllUsers([]);
        setStats({
          totalActive: 0,
          awaitingAction: 0,
          readyForDelivery: 0,
          deliveredLast30Days: 0,
        });
      });
      return;
    }

    // Fetch orders based on user role
    const ordersQuery = user.isManager
      ? query(collection(db, "orders"), orderBy("createdAt", "desc"))
      : query(
          collection(db, "orders"),
          where("createdByUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (querySnapshot) => {
        const ordersData: Order[] = querySnapshot.docs.map(
          (doc) =>
            ({
              ...doc.data(),
              id: doc.id,
            } as Order)
        );
        setOrders(ordersData);

        // Calculate stats (only for managers, but compute for all users for simplicity)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newStats = ordersData.reduce(
          (acc, order) => {
            if (order.status !== OrderStatus.Delivered) {
              acc.totalActive++;
            }
            if (
              [
                OrderStatus.FactoryOrder,
                OrderStatus.Locate,
                OrderStatus.DealerExchange,
              ].includes(order.status)
            ) {
              acc.awaitingAction++;
            }
            if (order.status === OrderStatus.Received) {
              acc.readyForDelivery++;
            }
            const createdAtDate = (order.createdAt as Timestamp)?.toDate();
            if (
              order.status === OrderStatus.Delivered &&
              createdAtDate &&
              createdAtDate > thirtyDaysAgo
            ) {
              acc.deliveredLast30Days++;
            }
            return acc;
          },
          {
            totalActive: 0,
            awaitingAction: 0,
            readyForDelivery: 0,
            deliveredLast30Days: 0,
          }
        );
        setStats(newStats);
      },
      (error) => {
        console.error("Error fetching orders from Firestore: ", error);
      }
    );

    // Fetch all users (only for managers)
    let unsubscribeUsers: (() => void) | undefined;
    if (user.isManager) {
      const usersQuery = query(
        collection(db, USERS_COLLECTION),
        orderBy("displayName", "asc")
      );
      unsubscribeUsers = onSnapshot(
        usersQuery,
        (querySnapshot) => {
          const usersData: AppUser[] = querySnapshot.docs.map(
            (doc) => doc.data() as AppUser
          );
          setAllUsers(usersData);
        },
        (error) => {
          console.error("Error fetching users from Firestore: ", error);
        }
      );
    }

    // Fetch vehicle options (for all authenticated users)
    const optionsQuery = query(
      collection(db, VEHICLE_OPTIONS_COLLECTION),
      orderBy("type", "asc"),
      orderBy("code", "asc")
    );
    const unsubscribeOptions = onSnapshot(
      optionsQuery,
      (querySnapshot) => {
        const optionsData: VehicleOption[] = querySnapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as VehicleOption)
        );
        setVehicleOptions(optionsData);
      },
      (error) => {
        console.error("Error fetching vehicle options from Firestore: ", error);
      }
    );

    return () => {
      unsubscribeOrders?.();
      unsubscribeUsers?.();
      unsubscribeOptions?.();
    };
  }, [user]);

  const handleAddOrder = useCallback(
    async (newOrder: Omit<Order, "id">): Promise<boolean> => {
      try {
        const orderPayload = { ...newOrder };
        Object.keys(orderPayload).forEach((key) => {
          if (orderPayload[key as keyof typeof orderPayload] === undefined) {
            delete orderPayload[key as keyof typeof orderPayload];
          }
        });

        await addDoc(collection(db, "orders"), {
          ...orderPayload,
          createdAt: serverTimestamp(),
          createdByUid: user?.uid,
          createdByEmail: user?.email,
        });
        return true;
      } catch (error) {
        console.error("Error adding order: ", error);
        alert("Failed to add order. Please try again.");
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
      try {
        const userDocRef = doc(db, USERS_COLLECTION, uid);
        await updateDoc(userDocRef, { isManager });
      } catch (error) {
        console.error("Error updating user role:", error);
        alert("Failed to update user role. Please try again.");
      }
    },
    [user]
  );

  const handleAddVehicleOption = useCallback(
    async (option: Omit<VehicleOption, 'id'>) => {
      if (!user?.isManager) return; // Security check
      try {
        await addDoc(collection(db, VEHICLE_OPTIONS_COLLECTION), {
          ...option,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error adding vehicle option:", error);
        throw error;
      }
    },
    [user]
  );

  const handleDeleteVehicleOption = useCallback(
    async (optionId: string) => {
      if (!user?.isManager) return; // Security check
      try {
        await deleteDoc(doc(db, VEHICLE_OPTIONS_COLLECTION, optionId));
      } catch (error) {
        console.error("Error deleting vehicle option:", error);
        throw error;
      }
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
                        vehicleOptions={vehicleOptions}
                      />
                    </div>
                  )}
                  <OrderList
                    orders={orders}
                    onUpdateStatus={handleUpdateOrderStatus}
                    onDeleteOrder={handleDeleteOrder}
                    currentUser={user}
                    vehicleOptions={vehicleOptions}
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
                        vehicleOptions={vehicleOptions}
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
                      vehicleOptions={vehicleOptions}
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
                  vehicleOptions={vehicleOptions}
                  onUpdateUserRole={handleUpdateUserRole}
                  onAddVehicleOption={handleAddVehicleOption}
                  onDeleteVehicleOption={handleDeleteVehicleOption}
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

import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { db, auth } from "./services/firebase";
import { Order, OrderStatus, AppUser } from "./types";
import { MANAGER_EMAILS, USERS_COLLECTION } from "./constants";
import Header from "./components/Header";
import OrderForm from "./components/OrderForm";
import OrderList from "./components/OrderList";
import Login from "./components/Login";
import LoadingSpinner from "./components/LoadingSpinner";
import SettingsPage from "./components/SettingsPage";
import DashboardStats from "./components/DashboardStats";
import ProtectedRoute from "./components/ProtectedRoute";
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
  const [isLoading, setIsLoading] = useState(true);
  const [isOrderFormVisible, setIsOrderFormVisible] = useState(false);
  const [stats, setStats] = useState({
    totalActive: 0,
    awaitingAction: 0,
    readyForDelivery: 0,
    deliveredLast30Days: 0,
  });

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
      if (authUser && authUser.email?.endsWith("@priorityautomotive.com")) {
        const userDocRef = doc(db, USERS_COLLECTION, authUser.uid);
        const userDoc = await getDoc(userDocRef);

        console.log(
          "%c👤 Auth Flow - User Document Fetch",
          "color: #10b981; font-weight: bold;"
        );
        console.log("User email:", authUser.email);
        console.log("User document exists:", userDoc.exists());

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
          await setDoc(userDocRef, appUser);
          console.log("Created new user document with isManager:", isManager);
        } else {
          // EXISTING USER: Firestore is the single source of truth for the manager role.
          // Changes made via Settings page will persist because we read from Firestore, not MANAGER_EMAILS.
          const existingData = userDoc.data();
          let isManager = existingData.isManager;
          console.log("EXISTING USER - Firestore document data:", existingData);
          console.log("Fetched isManager from Firestore:", isManager);

          // One-time migration for older user documents that might not have the isManager field.
          // Checking for non-boolean handles undefined, null, and any incorrectly stored values.
          if (typeof isManager !== "boolean") {
            isManager = MANAGER_EMAILS.includes(authUser.email!.toLowerCase());
            console.log(
              "MIGRATION - isManager was not boolean, setting to:",
              isManager
            );
            // Write the migrated value to Firestore so it persists.
            await updateDoc(userDocRef, { isManager });
          } else if (
            !isManager &&
            MANAGER_EMAILS.includes(authUser.email!.toLowerCase())
          ) {
            // Persistent elevation: if an existing user is in MANAGER_EMAILS but not a manager yet,
            // elevate them now. This keeps MANAGER_EMAILS as an allow-list for upgrades only.
            console.log(
              "%cELEVATION - User found in MANAGER_EMAILS but isManager=false. Elevating to manager.",
              "color: #2563eb; font-weight: bold;"
            );
            isManager = true;
            await updateDoc(userDocRef, { isManager: true });
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
            `Will render admin navigation: ${appUser.isManager ? "YES" : "NO"}`
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
          await signOut(auth);
          alert(
            "Access denied. Please use a '@priorityautomotive.com' email address."
          );
        }
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user?.isManager) {
      // If user is not a manager, reset state outside the effect
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

    // Fetch orders for managers
    const ordersQuery = query(
      collection(db, "orders"),
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

        // Calculate stats
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

    // Fetch all users for managers
    const usersQuery = query(
      collection(db, USERS_COLLECTION),
      orderBy("displayName", "asc")
    );
    const unsubscribeUsers = onSnapshot(
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

    return () => {
      unsubscribeOrders?.();
      unsubscribeUsers?.();
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
        });
        return true;
      } catch (error) {
        console.error("Error adding order: ", error);
        alert("Failed to add order. Please try again.");
        return false;
      }
    },
    []
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
                  <div className="flex justify-center">
                    <div className="w-full max-w-3xl">
                      <OrderForm
                        onAddOrder={handleAddOrder}
                        currentUser={user}
                      />
                    </div>
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

import { Suspense, lazy, useEffect } from 'react';
import {
    BrowserRouter,
    Navigate,
    Outlet,
    Route,
    Routes,
    useNavigate,
} from 'react-router-dom';
import { useAuthStore } from './store/auth';
import { api, initializeClientDataLayer, refreshOfflineDataState } from './api';
import { requestNotificationPermission, subscribeUserToPush } from './services/push.service';
import Layout from './components/Layout';

const AuthPage = lazy(() => import('./pages/Auth/AuthPage'));
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Shopping = lazy(() => import('./pages/Shopping/Shopping'));
const Calendar = lazy(() => import('./pages/Calendar/Calendar'));
const Meals = lazy(() => import('./pages/Meals/Meals'));
const Recipes = lazy(() => import('./pages/Recipes/Recipes'));
const RecipeDetail = lazy(() => import('./pages/Recipes/RecipeDetail'));
const RecipeImportPage = lazy(() => import('./pages/Recipes/RecipeImportPage'));
const RecipeEditPage = lazy(() => import('./pages/Recipes/RecipeEditPage'));
const Projects = lazy(() => import('./pages/Projects/Projects'));
const AdminUsersPage = lazy(() => import('./pages/Admin/AdminUsersPage'));

function RouteFallback() {
    return <div className="page-container" />;
}

function PrivateLayout() {
    const token = useAuthStore((state) => state.token);

    if (!token) {
        return <Navigate to="/login" replace />;
    }

    return (
        <Layout>
            <Suspense fallback={<RouteFallback />}>
                <Outlet />
            </Suspense>
        </Layout>
    );
}

function AppShell() {
    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);
    const navigate = useNavigate();

    useEffect(() => {
        initializeClientDataLayer();
    }, []);

    useEffect(() => {
        const initAuth = async () => {
            if (!token) {
                return;
            }

            try {
                await api.auth.validateToken();
            } catch {
                logout();
                navigate('/login', { replace: true });
            }
        };

        void initAuth();
    }, [token, logout, navigate]);

    useEffect(() => {
        if (token) {
            void refreshOfflineDataState();
        }
    }, [token]);

    useEffect(() => {
        const initPush = async () => {
            try {
                const granted = await requestNotificationPermission();
                if (granted && token) {
                    await subscribeUserToPush();
                }
            } catch (error) {
                console.error('Push initialization error:', error);
            }
        };

        void initPush();
    }, [token]);

    return (
        <Routes>
            <Route
                path="/login"
                element={token ? <Navigate to="/" replace /> : (
                    <Suspense fallback={<RouteFallback />}>
                        <AuthPage />
                    </Suspense>
                )}
            />
            <Route element={<PrivateLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/shopping" element={<Shopping />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/chores" element={<Navigate to="/calendar" replace />} />
                <Route path="/meals" element={<Meals />} />
                <Route path="/recipes" element={<Recipes />} />
                <Route path="/recipes/import" element={<RecipeImportPage />} />
                <Route path="/recipes/:id" element={<RecipeDetail />} />
                <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
                <Route path="/projects/*" element={<Projects />} />
                <Route path="/admin" element={<AdminUsersPage />} />
            </Route>
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AppShell />
        </BrowserRouter>
    );
}

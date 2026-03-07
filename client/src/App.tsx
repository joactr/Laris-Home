import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Layout from './components/Layout';
import AuthPage from './pages/Auth/AuthPage';
import Dashboard from './pages/Dashboard/Dashboard';
import Shopping from './pages/Shopping/Shopping';
import Calendar from './pages/Calendar/Calendar';
import Chores from './pages/Chores/Chores';
import Meals from './pages/Meals/Meals';
import Recipes from './pages/Recipes/Recipes';
import RecipeDetail from './pages/Recipes/RecipeDetail';
import RecipeImportPage from './pages/Recipes/RecipeImportPage';
import RecipeEditPage from './pages/Recipes/RecipeEditPage';
import Projects from './pages/Projects/Projects';
import AdminUsersPage from './pages/Admin/AdminUsersPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
    const token = useAuthStore((s) => s.token);
    return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
    const token = useAuthStore((s) => s.token);
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={token ? <Navigate to="/" replace /> : <AuthPage />} />
                <Route
                    path="/*"
                    element={
                        <PrivateRoute>
                            <Layout>
                                <Routes>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/shopping" element={<Shopping />} />
                                    <Route path="/calendar" element={<Calendar />} />
                                    <Route path="/chores" element={<Chores />} />
                                    <Route path="/meals" element={<Meals />} />
                                    <Route path="/recipes" element={<Recipes />} />
                                    <Route path="/recipes/import" element={<RecipeImportPage />} />
                                    <Route path="/recipes/:id" element={<RecipeDetail />} />
                                    <Route path="/recipes/:id/edit" element={<RecipeEditPage />} />
                                    <Route path="/projects/*" element={<Projects />} />
                                    <Route path="/admin" element={<AdminUsersPage />} />
                                </Routes>
                            </Layout>
                        </PrivateRoute>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}

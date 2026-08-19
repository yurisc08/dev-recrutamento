import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Home } from './pages/Home'
import { CategoryPage } from './pages/CategoryPage'
import { ThreadDetail } from './pages/ThreadDetail'
import { NewThread } from './pages/NewThread'
import { Chat } from './pages/Chat'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/Settings'
import { SearchPage } from './pages/Search'
import { Members } from './pages/Members'
import { NotFound } from './pages/NotFound'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/entrar" element={<Login />} />
            <Route path="/cadastro" element={<Register />} />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/c/:slug" element={<CategoryPage />} />
              <Route path="/t/:id" element={<ThreadDetail />} />
              <Route path="/novo" element={<NewThread />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/chat/:slug" element={<Chat />} />
              <Route path="/u/:username" element={<ProfilePage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
              <Route path="/busca" element={<SearchPage />} />
              <Route path="/membros" element={<Members />} />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<Navigate to="/404" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

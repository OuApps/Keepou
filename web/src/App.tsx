import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { ThemeProvider } from './theme/ThemeProvider'
import { AppShell } from './components/AppShell'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import BoardPage from './pages/BoardPage'
import AdminPage from './pages/AdminPage'
import ImportKeepPage from './pages/ImportKeepPage'
import NoteEditorPage from './pages/NoteEditorPage'
import HistoryPage from './pages/HistoryPage'
import NotFoundPage from './pages/NotFoundPage'

/**
 * Application root: providers (theme + auth) and the route map from handoff §5.
 * The Router lives in `main.tsx`. Guarded routes redirect to /login (RequireAuth);
 * the screens are placeholders until their epic (E2 auth, E3 board, E4/E5 editor,
 * E6 history, E7 admin).
 */
export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated */}
          <Route element={<RequireAuth />}>
            {/* The Board composes its own shell (search + tabs in the Topbar). */}
            <Route path="/" element={<BoardPage />} />
            <Route element={<AppShell />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
            {/* The import flow brings its own full-page shell (E10-S3). */}
            <Route path="/import" element={<ImportKeepPage />} />
            <Route path="/note/:id" element={<NoteEditorPage />} />
            <Route path="/note/:id/history" element={<HistoryPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  )
}

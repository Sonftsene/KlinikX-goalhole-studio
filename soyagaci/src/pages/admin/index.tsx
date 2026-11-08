import { Navigate, Route, Routes } from 'react-router-dom'
import { AdminNav } from './shared'
import Overview from './Overview'
import Approvals from './Approvals'
import Users from './Users'
import Persons from './Persons'
import Invites from './Invites'
import AuditLog from './AuditLog'
import Settings from './Settings'
import ImportExport from './ImportExport'
import { useFamily } from '../../store/useFamily'
import { isAdmin } from '../../lib/permissions'
import type { ReactNode } from 'react'

function AdminOnly({ children }: { children: ReactNode }) {
  const user = useFamily((s) => s.user)
  if (!isAdmin(user)) return <Navigate to="/admin" replace />
  return <>{children}</>
}

/** Management panel, mounted at /admin/*. */
export default function AdminRoutes() {
  return (
    <div>
      <AdminNav />
      <Routes>
        <Route index element={<Overview />} />
        <Route path="onaylar" element={<Approvals />} />
        <Route path="kullanicilar" element={<Users />} />
        <Route path="kisiler" element={<Persons />} />
        <Route path="davetler" element={<Invites />} />
        <Route path="gecmis" element={<AuditLog />} />
        <Route
          path="ayarlar"
          element={
            <AdminOnly>
              <Settings />
            </AdminOnly>
          }
        />
        <Route path="aktar" element={<ImportExport />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  )
}

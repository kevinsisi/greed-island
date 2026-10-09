import { Navigate } from 'react-router-dom'

/** No URL proof or legacy JWT flow remains. */
export function ResetPasswordPage() { return <Navigate to="/reset-password" replace /> }

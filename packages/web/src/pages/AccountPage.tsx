import { Navigate } from 'react-router-dom'

/** Sign-in/registration share the sole game form. */
export function AccountPage() { return <Navigate to="/game" replace /> }

import { Link } from 'react-router-dom'

export function ForgotPasswordPage() { return <main className="gi-panel p-5 flex flex-col gap-4"><h1>帳號復原</h1><p>請透過已核對身份的管道向管理員取得單次復原證明。本站不會從此頁發放證明或寄送電子郵件。</p><Link to="/reset-password">輸入復原證明並設定新密碼</Link><Link to="/game">返回共同世界</Link></main> }

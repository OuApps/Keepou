import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

/** 404 — unknown route. */
export default function NotFoundPage() {
  const { COMMON_COPY, NOT_FOUND_COPY } = useI18n()
  return (
    <div className="kp-center">
      <div className="kp-brand">
        <img src="/keepou-mascot.png" alt="" className="kp-brand__logo" width={44} height={44} />
        <span className="kp-brand__name">{COMMON_COPY.appName}</span>
      </div>
      <h1 className="kp-title" style={{ fontSize: 22 }}>
        {NOT_FOUND_COPY.title}
      </h1>
      <p className="kp-muted">{NOT_FOUND_COPY.text}</p>
      <Link to="/" className="kp-link">
        {COMMON_COPY.backToBoard}
      </Link>
    </div>
  )
}

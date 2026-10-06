import { useLang } from '../i18n';
import { VLink } from '../components/VLink';

export function NotFound() {
  const { t } = useLang();
  return (
    <div className="page not-found">
      <p className="not-found__glyph reveal" aria-hidden>🍿</p>
      <h1 className="page-title reveal">{t.notFound}</h1>
      <VLink to="/" className="btn btn--primary reveal">{t.goHome}</VLink>
    </div>
  );
}

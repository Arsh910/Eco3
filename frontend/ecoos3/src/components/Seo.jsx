import { Helmet } from 'react-helmet-async';
import { OG_IMAGE, SITE_NAME, SITE_URL } from '../lib/site';

// The <head> tags for one route. `path` is the route itself, e.g. "/how-it-works".
export function Seo({ title, description, path }) {
  const url = SITE_URL + path;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={OG_IMAGE} />

      <meta name="twitter:card" content="summary_large_image" />
    </Helmet>
  );
}

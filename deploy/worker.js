const canonicalHost = 'arcadebench.org';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === `www.${canonicalHost}`) {
      url.hostname = canonicalHost;
      return Response.redirect(url.toString(), 308);
    }

    return env.ASSETS.fetch(request);
  },
};

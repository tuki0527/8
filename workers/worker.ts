import { handleApiRequest, type MoonCodeServerEnv } from '../server/shared/githubSyncHandler.ts';

export interface WorkerEnv extends MoonCodeServerEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return handleApiRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

import { createBackendPlugin, coreServices } from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const describeInstancesPlugin = createBackendPlugin({
  pluginId: 'describe-instances',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
      },
      async init({ logger, httpRouter }) {
        httpRouter.addAuthPolicy({
          path: '/',
          allow: 'unauthenticated',
        })

        const router = await createRouter({ logger });

        httpRouter.use(router);

      },
    });

  },
});

import { createPlugin, createRoutableExtension } from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';

export const describeInstancesPlugin = createPlugin({
  id: 'describe-instances',
  routes: {
    root: rootRouteRef,
  },
});

export const DescribeInstancesPage = describeInstancesPlugin.provide(
  createRoutableExtension({
    name: 'DescribeInstancesPage',
    component: () => import('./components/DescribeInstancesPage').then(m => m.DescribeInstancesPage),
    mountPoint: rootRouteRef,
  }),
);

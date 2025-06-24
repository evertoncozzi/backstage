import { createDevApp } from '@backstage/dev-utils';
import { describeInstancesPlugin, DescribeInstancesPage } from '../src/plugin';

createDevApp()
  .registerPlugin(describeInstancesPlugin)
  .addPage({
    element: <DescribeInstancesPage />,
    title: 'Root Page',
    path: '/describe-instances',
  })
  .render();

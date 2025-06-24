import express from 'express';
import { LoggerService } from '@backstage/backend-plugin-api';
import { fromIni } from '@aws-sdk/credential-providers';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';

import fs from 'fs';
import os from 'os';
import path from 'path';

type RouterOptions = {
  logger: LoggerService;
};

// 🔸 Função para extrair a região de um profile no ~/.aws/config
function getRegionFromProfile(profile: string): string | undefined {
  const configPath = path.join(os.homedir(), '.aws', 'config');
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  const configContent = fs.readFileSync(configPath, 'utf-8');
  const profileRegex = new RegExp(`\\[profile ${profile}\\]([\\s\\S]*?)(\\n\\[|$)`, 'g');
  const match = profileRegex.exec(configContent);

  if (match) {
    const body = match[1];
    const regionMatch = body.match(/region\s*=\s*(.+)/);
    if (regionMatch) {
      return regionMatch[1].trim();
    }
  }
  return undefined;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger } = options;

  const router = express.Router();

  router.get('/health', async (_, res) => {
    logger.info('Health check called');
    res.status(200).json({ status: 'ok' });
  });

  router.get('/aws-accounts', async (req, res) => {
    const profile = req.query.profile as string;
    const stateFilter = req.query.state as string;
    const nameFilter = req.query.name as string;

    if (!profile) {
      return res.status(400).json({ error: 'Missing profile in query' });
    }

    // 🔥 Lê a região do profile
    const region = getRegionFromProfile(profile);

    if (!region) {
      return res.status(400).json({
        error: `Region not found in profile "${profile}"`,
      });
    }

    logger.info(
      `AWS DescribeInstances requested for profile: ${profile}, region: ${region}`,
    );

    try {
      const credentials = fromIni({ profile });

      const ec2Client = new EC2Client({
        credentials,
        region,
      });

      const command = new DescribeInstancesCommand({});
      const result = await ec2Client.send(command);

      const instances = (result.Reservations || []).flatMap(reservation =>
        (reservation.Instances || []).map(instance => {
          const tags: Record<string, string> = {};
          (instance.Tags || []).forEach(tag => {
            if (tag.Key && tag.Value) {
              tags[tag.Key] = tag.Value;
            }
          });

          return {
            InstanceId: instance.InstanceId,
            Name: tags['Name'] || '',
            State: instance.State?.Name,
            InstanceType: instance.InstanceType,
            PrivateIp: instance.PrivateIpAddress || '',
            PublicIp: instance.PublicIpAddress || '',
            Region: region,
            LaunchTime: instance.LaunchTime,
            VpcId: instance.VpcId,
            SubnetId: instance.SubnetId,
            ImageId: instance.ImageId,
            SecurityGroups: (instance.SecurityGroups || []).map(sg => sg.GroupName).join(', '),
            Tags: tags,
          };
        }),
      );

      const filtered = instances.filter(instance => {
        const matchState = stateFilter ? instance.State === stateFilter : true;
        const matchName = nameFilter
          ? instance.Name?.toLowerCase().includes(nameFilter.toLowerCase())
          : true;
        return matchState && matchName;
      });

      res.status(200).json(filtered);
    } catch (error: any) {
      logger.error(`AWS DescribeInstances error: ${error}`);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/aws-profiles', async (_, res) => {
    try {
      const configFile = fs.readFileSync(
        path.join(os.homedir(), '.aws', 'config'),
        'utf-8',
      );
      const profiles = Array.from(
        configFile.matchAll(/\[profile (.+?)\]/g),
      ).map(match => match[1]);

      if (profiles.length === 0) {
        return res.status(404).json({ error: 'No AWS profiles found' });
      }

      res.status(200).json(profiles);
    } catch (error: any) {
      res
        .status(500)
        .json({ error: `Failed to read AWS profiles: ${error.message}` });
    }
  });

  return router;
}

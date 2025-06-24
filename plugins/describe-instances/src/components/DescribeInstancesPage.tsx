import React, { useEffect, useState } from 'react';
import {
  Content,
  Header,
  LinkButton,
  Page,
  Progress,
  ResponseErrorPanel,
  Table,
} from '@backstage/core-components';
import { Select } from '@backstage/core-components';
import { Alert, Grid, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useApi, fetchApiRef } from '@backstage/core-plugin-api';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type Instance = {
  InstanceId: string;
  InstanceType: string;
  State: string;
  PrivateIp: string;
  PublicIp?: string;
  Name?: string;
  Region: string;
  Tags: Record<string, string>;
};

type ProfileOption = {
  label: string;
  value: string;
};

export const DescribeInstancesPage = () => {
  const fetchApi = useApi(fetchApiRef);

  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);

  // Estado para controlar modal e instância selecionada
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Buscar profiles AWS no backend quando o componente monta
  useEffect(() => {
    const fetchProfiles = async () => {
      setLoading(true);
      try {
        const res = await fetchApi.fetch(
          'http://localhost:7007/api/describe-instances/aws-profiles',
        );
        const data = await res.json();

        const options = data.map((profile: string) => ({
          label: profile,
          value: profile,
        }));

        setProfiles(options);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, [fetchApi]);

  // Buscar instâncias AWS para o profile selecionado
  const handleFetchInstances = async () => {
    if (!selectedProfile) return;
    setLoading(true);
    setError(null);
    setInstances([]);

    try {
      const res = await fetchApi.fetch(
        `http://localhost:7007/api/describe-instances/aws-accounts?profile=${selectedProfile}`,
      );
      const data = await res.json();

      if (res.ok) {
        const parsed = Array.isArray(data) ? data : data.instances;
        setInstances(parsed);
      } else {
        setError(data);
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  // Exporta as instâncias para Excel usando XLSX e file-saver
  const exportToExcel = () => {
    const dataToExport = instances.map(instance => ({
      InstanceId: instance.InstanceId,
      Name: instance.Name || '',
      InstanceType: instance.InstanceType,
      State: instance.State,
      PrivateIp: instance.PrivateIp,
      PublicIp: instance.PublicIp || '',
      Region: instance.Region,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Instances');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
    });

    const blob = new Blob([excelBuffer], {
      type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    saveAs(blob, 'ec2-instances.xlsx');
  };

  // Abre modal com detalhes da instância selecionada
  const handleOpenDetails = (instance: Instance) => {
    setSelectedInstance(instance);
    setModalOpen(true);
  };

  // Fecha o modal e limpa a instância selecionada
  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedInstance(null);
  };

  return (
    <Page themeId="tool">
      <Header
        title="Describe Instances"
        subtitle="Listagem de instâncias AWS"
      />
      <Content>
        {loading && <Progress />}

        {error && (
          <ResponseErrorPanel
            error={typeof error === 'string' ? new Error(error) : error}
          />
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Select
              label="Selecione um AWS Profile"
              items={profiles}
              selected={selectedProfile}
              onChange={value => setSelectedProfile(value as string)}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <LinkButton
              to="#"
              variant="contained"
              color="primary"
              onClick={handleFetchInstances}
              disabled={!selectedProfile}
            >
              Listar Instâncias
            </LinkButton>
          </Grid>
        </Grid>

        {instances.length > 0 && (
          <>
            <Grid container justifyContent="flex-end" style={{ marginTop: 16 }}>
              <Button variant="outlined" onClick={exportToExcel}>
                Exportar para Excel
              </Button>
            </Grid>

            <Table
              title="Instâncias EC2"
              columns={[
                { title: 'Instance ID', field: 'InstanceId' },
                { title: 'Name', field: 'Name' },
                { title: 'Instance Type', field: 'InstanceType' },
                { title: 'State', field: 'State' },
                { title: 'Private IP', field: 'PrivateIp' },
                { title: 'Public IP', field: 'PublicIp' },
                { title: 'Region', field: 'Region' },
                {
                  title: 'Detalhes',
                  field: 'details',
                  render: (rowData: Instance) => (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleOpenDetails(rowData)}
                    >
                      Ver Detalhes
                    </Button>
                  ),
                },
              ]}
              data={instances}
              options={{ search: true, paging: true }}
            />
          </>
        )}

        {instances.length === 0 && !loading && !error && (
          <Alert severity="info">Nenhuma instância encontrada.</Alert>
        )}

        <Dialog open={modalOpen} onClose={handleCloseModal} maxWidth="sm" fullWidth>
          <DialogTitle>Detalhes da Instância</DialogTitle>
          <DialogContent dividers>
            {selectedInstance ? (
              <>
                <Typography variant="subtitle1"><strong>Instance ID:</strong> {selectedInstance.InstanceId}</Typography>
                <Typography variant="subtitle1"><strong>Name:</strong> {selectedInstance.Name || '-'}</Typography>
                <Typography variant="subtitle1"><strong>Instance Type:</strong> {selectedInstance.InstanceType}</Typography>
                <Typography variant="subtitle1"><strong>State:</strong> {selectedInstance.State}</Typography>
                <Typography variant="subtitle1"><strong>Private IP:</strong> {selectedInstance.PrivateIp}</Typography>
                <Typography variant="subtitle1"><strong>Public IP:</strong> {selectedInstance.PublicIp || '-'}</Typography>
                <Typography variant="subtitle1"><strong>Region:</strong> {selectedInstance.Region}</Typography>
                <Typography variant="subtitle1" gutterBottom><strong>Tags:</strong></Typography>
                {selectedInstance.Tags && Object.keys(selectedInstance.Tags).length > 0 ? (
                  Object.entries(selectedInstance.Tags).map(([key, value]) => (
                    <Typography key={key} variant="body2">{key}: {value}</Typography>
                  ))
                ) : (
                  <Typography variant="body2">Sem tags</Typography>
                )}
              </>
            ) : (
              <Typography>Nenhuma instância selecionada.</Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseModal} color="primary">Fechar</Button>
          </DialogActions>
        </Dialog>
      </Content>
    </Page>
  );
};

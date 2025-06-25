import React, { useState, useEffect } from 'react';
// Importa componentes do Material-UI para a interface visual
import {
  Container,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Paper,
  Box,
} from '@mui/material';
import {
  Content,
  Header,
  Page,
} from '@backstage/core-components';

// URL do proxy para Jenkins (evita problemas CORS e esconde autenticação direta)
const JENKINS_PROXY_URL = 'http://localhost:7007/api/proxy/jenkins';
// Intervalo de polling para atualizar status do build (em ms)
const POLLING_INTERVAL = 3000; // 3 segundos

// Credenciais para autenticação básica (usuário e API token do Jenkins)
// A base64 (btoa) cria o token para o cabeçalho Authorization
const USERNAME = 'cozzi';
const API_TOKEN = '11449d1ae4609e849c09367eb88fbe9556';
const TOKEN = btoa(`${USERNAME}:${API_TOKEN}`);

export const JenkinsTrigger = () => {
  // Estados React para controlar dados e UI:
  // mensagem para feedback ao usuário
  const [message, setMessage] = useState('');
  // saída do console do build
  const [consoleOutput, setConsoleOutput] = useState('');
  // flag para controlar se o polling está ativo (busca status)
  const [isPolling, setIsPolling] = useState(false);
  // objeto com informações do build atual
  const [buildInfo, setBuildInfo] = useState(null);
  // lista de jobs disponíveis no Jenkins
  const [jobs, setJobs] = useState([]);
  // job selecionado pelo usuário
  const [selectedJob, setSelectedJob] = useState('');
  // parâmetro de input que será enviado para o job (ex: mensagem)
  const [inputParam, setInputParam] = useState('');
  // número do build que foi disparado (para buscar logs e status)
  const [buildNumber, setBuildNumber] = useState(null);

  // useEffect para carregar os jobs disponíveis no Jenkins na montagem do componente
  useEffect(() => {
    const fetchJobs = async () => {
      try {
        // Faz requisição GET para /api/json para pegar lista de jobs
        const res = await fetch(`${JENKINS_PROXY_URL}/api/json`, {
          headers: { Authorization: `Basic ${TOKEN}` },
        });
        const data = await res.json();
        // Atualiza estado com a lista de jobs recebida
        setJobs(data.jobs || []);
      } catch (error) {
        console.error('Erro ao buscar jobs:', error);
      }
    };
    fetchJobs();
  }, []); // [] significa que executa uma única vez no load

  /**
   * Função para fazer polling na fila do Jenkins para capturar o buildNumber
   * do job disparado, já que o build pode demorar para ser iniciado.
   * Retorna uma Promise que resolve com o número do build.
   */
  const pollQueueForBuildNumber = () => {
    return new Promise((resolve, reject) => {
      // Define intervalo para checar a fila a cada 2 segundos
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${JENKINS_PROXY_URL}/queue/api/json`, {
            headers: { Authorization: `Basic ${TOKEN}` },
          });
          const data = await res.json();

          // Procura o item na fila que corresponde ao job e parâmetro enviados
          const item = data.items.find(
            (i) =>
              i.task.name === selectedJob &&
              i.params?.includes(inputParam)
          );

          if (!item) {
            // Se o item não está mais na fila, pode já estar rodando
            clearInterval(interval);

            // Pega o último build para garantir que está ativo e obter número
            const lastBuildRes = await fetch(
              `${JENKINS_PROXY_URL}/job/${selectedJob}/lastBuild/api/json`,
              { headers: { Authorization: `Basic ${TOKEN}` } }
            );
            const lastBuild = await lastBuildRes.json();
            if (lastBuild?.number) {
              resolve(lastBuild.number);
            } else {
              reject('Não foi possível obter o número do build.');
            }
          } else if (item.executable && item.executable.number) {
            // Se já saiu da fila e virou build, pega o número e resolve
            clearInterval(interval);
            resolve(item.executable.number);
          }
          // Se nada disso, continua esperando (polling continua)
        } catch (e) {
          clearInterval(interval);
          reject(e);
        }
      }, 2000);
    });
  };

  /**
   * Função para disparar o job no Jenkins com parâmetro (inputParam).
   * Atualiza mensagens de status para o usuário e inicia polling para o build.
   */
  const triggerJob = async () => {
    if (!selectedJob) return setMessage('❌ Selecione um job!');

    setMessage('🚀 Disparando job...');
    setConsoleOutput('');
    setBuildInfo(null);
    setBuildNumber(null);

    try {
      // URL para disparar job com parâmetros
      const url = `${JENKINS_PROXY_URL}/job/${selectedJob}/buildWithParameters`;

      // Prepara o corpo da requisição com o parâmetro 'MSG'
      const body = new URLSearchParams();
      body.append('MSG', inputParam);

      // Requisição POST para iniciar o build
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      // Verifica se o disparo foi aceito com sucesso (status 200, 201 ou redirecionamento 302)
      if ([200, 201].includes(response.status) || response.status === 302) {
        setMessage('✅ Job disparado com sucesso! Buscando build...');

        try {
          // Aguarda até o polling achar o número do build disparado
          const number = await pollQueueForBuildNumber();
          setBuildNumber(number);
          // Ativa polling para monitorar build e pegar logs
          setIsPolling(true);
        } catch (e) {
          setMessage(`❌ Erro ao obter buildNumber: ${e}`);
        }
      } else {
        // Caso erro no disparo, pega o texto da resposta para exibir
        const errorText = await response.text();
        setMessage(`❌ Erro ao disparar job (${response.status}): ${errorText}`);
      }
    } catch (error) {
      setMessage(`❌ Erro na requisição: ${error}`);
    }
  };

  /**
   * useEffect que roda enquanto o polling está ativo (isPolling = true)
   * e faz requisições periódicas para atualizar o status do build e os logs.
   */
  useEffect(() => {
    let interval;
    const fetchBuildData = async () => {
      if (!selectedJob || !buildNumber) return;

      try {
        // Busca informações detalhadas do build (status, resultado, etc)
        const res = await fetch(
          `${JENKINS_PROXY_URL}/job/${selectedJob}/${buildNumber}/api/json`,
          { headers: { Authorization: `Basic ${TOKEN}` } }
        );
        const data = await res.json();
        setBuildInfo(data);

        // Se o build terminou, desativa o polling
        if (!data.building) setIsPolling(false);

        // Busca o log do console do build para mostrar na UI
        const logRes = await fetch(
          `${JENKINS_PROXY_URL}/job/${selectedJob}/${buildNumber}/consoleText`,
          { headers: { Authorization: `Basic ${TOKEN}` } }
        );
        const logText = await logRes.text();
        setConsoleOutput(logText);
      } catch (err) {
        console.error('Erro ao buscar status:', err);
      }
    };

    if (isPolling) {
      fetchBuildData(); // Busca imediatamente
      interval = setInterval(fetchBuildData, POLLING_INTERVAL); // E a cada 3 segundos
    }
    // Limpa o intervalo quando componente desmonta ou isPolling muda
    return () => clearInterval(interval);
  }, [isPolling, selectedJob, buildNumber]);

  // Renderização da interface com Material-UI
  return (

    <Page themeId='group'>
      <Header
        title="Jenkins Jobs"
        subtitle="Lista de Jobs Jenkins"
      />
      <Content>

    <Container maxWidth="md" sx={{ fontFamily: 'monospace', py: 4 }}>
      {/* Título da aplicação */}
      <Typography variant="h4" gutterBottom>
        🛠️ Jenkins Jobs
      </Typography>

      {/* Dropdown para seleção do job */}
      <FormControl fullWidth margin="normal">
        <InputLabel id="job-select-label">Escolha o Job</InputLabel>
        <Select
          labelId="job-select-label"
          value={selectedJob}
          label="Escolha o Job"
          onChange={(e) => setSelectedJob(e.target.value)}
        >
          <MenuItem value="">
            <em>-- Selecione --</em>
          </MenuItem>
          {/* Lista os jobs carregados */}
          {jobs.map((job) => (
            <MenuItem key={job.name} value={job.name}>
              {job.name} ({job.color})
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Campo de texto para o parâmetro que será enviado ao job */}
      <TextField
        label="Echo..."
        value={inputParam}
        onChange={(e) => setInputParam(e.target.value)}
        fullWidth
        margin="normal"
        placeholder="Digite..."
      />

      {/* Botão para disparar o job */}
      <Button
        variant="contained"
        color="primary"
        onClick={triggerJob}
        sx={{ mt: 2 }}
        disabled={!selectedJob} // desabilita se nenhum job selecionado
      >
        ▶️ Executar Job
      </Button>

      {/* Mensagem de status para o usuário */}
      <Typography sx={{ mt: 2 }}>{message}</Typography>

      {/* Mostra detalhes do build caso buildInfo esteja definido */}
      {buildInfo && (
        <Paper sx={{ mt: 4, p: 2 }}>
          <Typography variant="h6" gutterBottom>
            📊 Detalhes do Build
          </Typography>
          <Typography>Build #: {buildInfo.number}</Typography>
          <Typography>
            Status: {buildInfo.building ? '🔄 Em execução...' : buildInfo.result}
          </Typography>
          <Typography>Duração: {Math.round(buildInfo.duration / 1000)}s</Typography>
        </Paper>
      )}

      {/* Mostra a saída do console do build em um container estilizado */}
      {consoleOutput && (
        <Paper
          sx={{
            mt: 4,
            p: 2,
            backgroundColor: '#f0f0f0',
            color: '#333',
            border: '3px solid #ccc',
            maxHeight: 600,
            overflowY: 'scroll',
            whiteSpace: 'pre-wrap', // mantém formatação dos logs
            fontFamily: 'monospace',
          }}
        >
          <Typography variant="h6" gutterBottom>
            📝 Console Output
          </Typography>
          {consoleOutput}
        </Paper>
      )}
    </Container>

    </Content>
    </Page>
  );
};

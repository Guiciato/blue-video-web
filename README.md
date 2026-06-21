# Blue Video Web

Versão web completa do Blue Video Downloader, acessível por Chrome, Edge, Firefox e Safari.

O projeto possui:

- frontend responsivo em HTML, CSS e JavaScript;
- instalação como PWA;
- backend Node.js + Express;
- downloads em MP4 de até 1080p;
- extração direta para MP3;
- suporte a playlists com limite configurável;
- conversão de vários MP4 para MP3;
- resultado em ZIP quando houver vários arquivos;
- progresso em tempo real por Server-Sent Events;
- cancelamento de tarefas;
- fila com concorrência configurável;
- limpeza automática dos arquivos temporários;
- validação de URLs para bloquear endereços locais e privados;
- limitação de requisições;
- Dockerfile e Docker Compose;
- validação automática no GitHub Actions.

> Use somente conteúdo próprio, de domínio público ou que você tenha autorização para baixar. O sistema não contorna DRM, paywalls ou autenticação.

## Estrutura

```text
blue-video-web/
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── sw.js
│   ├── manifest.webmanifest
│   └── assets/
├── src/
│   ├── processors/
│   │   ├── download.js
│   │   └── convert.js
│   ├── archive.js
│   ├── config.js
│   ├── job-store.js
│   ├── queue.js
│   └── security.js
├── test/
├── server.js
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env.example
```

## Opção 1 — Executar no Windows

### Requisitos

- Windows 10 ou 11;
- Node.js 22 ou superior;
- npm;
- Winget.

### Instalação

1. Extraia o projeto.
2. Execute:

```bat
instalar-windows.bat
```

3. Feche e abra novamente o terminal caso o `yt-dlp` ou o FFmpeg tenham acabado de ser instalados.
4. Execute:

```bat
iniciar-windows.bat
```

5. Acesse:

```text
http://localhost:3000
```

Também é possível iniciar manualmente:

```powershell
copy .env.example .env
npm install
npm start
```

## Opção 2 — Executar com Docker

Essa é a forma recomendada para hospedagem.

```bash
docker compose up -d --build
```

Abra:

```text
http://localhost:3000
```

O contêiner instala Node.js, Python, yt-dlp, FFmpeg e ffprobe.

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste quando necessário.

| Variável | Padrão | Função |
|---|---:|---|
| `PORT` | `3000` | Porta HTTP |
| `MAX_CONCURRENT_JOBS` | `1` | Tarefas processadas ao mesmo tempo |
| `MAX_PLAYLIST_ITEMS` | `30` | Limite de itens por playlist |
| `MAX_UPLOAD_FILES` | `10` | Máximo de MP4 por conversão |
| `MAX_UPLOAD_MB_PER_FILE` | `500` | Limite por arquivo enviado |
| `JOB_TTL_MINUTES` | `60` | Tempo para apagar resultados |
| `DOWNLOAD_RATE_LIMIT_MAX` | `10` | Novas tarefas por janela/IP |
| `YT_DLP_BIN` | `yt-dlp` | Caminho do yt-dlp |
| `FFMPEG_BIN` | `ffmpeg` | Caminho do FFmpeg |
| `FFPROBE_BIN` | `ffprobe` | Caminho do ffprobe |

## Colocar no GitHub

No PowerShell dentro da pasta:

```powershell
git init
git add .
git commit -m "Primeira versão do Blue Video Web"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/blue-video-web.git
git push -u origin main
```

Não envie o arquivo `.env`; ele já está no `.gitignore`.

## Publicação

O GitHub armazena o código, mas o GitHub Pages não executa Node.js, yt-dlp ou FFmpeg. Para publicar a aplicação completa, conecte o repositório a uma hospedagem que execute Docker.

Configuração básica da hospedagem:

- método de build: Dockerfile;
- porta: `3000`;
- health check: `/api/health`;
- diretório persistente recomendado: `/app/data`;
- memória recomendada: pelo menos 1 GB para cargas pequenas;
- HTTPS obrigatório para uma experiência PWA completa.

Em um VPS com Docker:

```bash
git clone https://github.com/SEU-USUARIO/blue-video-web.git
cd blue-video-web
docker compose up -d --build
```

Use um proxy reverso, como Caddy ou Nginx, para fornecer HTTPS e domínio próprio.

## Rotas da API

```text
GET    /api/health
POST   /api/jobs/download
POST   /api/jobs/convert
GET    /api/jobs/:id
GET    /api/jobs/:id/events
DELETE /api/jobs/:id
GET    /api/jobs/:id/download
```

Cada tarefa recebe um token aleatório. O navegador precisa desse token para acompanhar, cancelar ou baixar o resultado.

## Segurança e produção

A versão atual é adequada para uso pessoal ou pequeno grupo. Antes de abrir ao público em grande escala, considere:

- autenticação de usuários;
- Redis para fila e estado das tarefas;
- armazenamento S3 ou compatível para resultados;
- isolamento dos processos em contêineres separados;
- proxy com limite de upload e timeout;
- antivírus para arquivos enviados;
- métricas, logs centralizados e alertas;
- regras de firewall e rede que restrinjam o contêiner;
- termos de uso e política de privacidade.

A validação de URL bloqueia destinos locais conhecidos, mas um serviço público deve executar os workers em uma rede isolada para reduzir riscos de SSRF e abuso.

## Testes

```bash
npm run check
npm test
```

O workflow em `.github/workflows/ci.yml` executa essas verificações automaticamente nos pushes e pull requests.

## Correção v1.0.1 para deploy Docker

Esta versão ajusta o `Dockerfile` para usar `node:22-bookworm-slim` e instalar as dependências diretamente pelo `package.json`, usando o registry público do npm. Isso evita falhas de build quando um `package-lock.json` foi gerado em outro ambiente.

## Observação importante sobre YouTube em hospedagens públicas

Em serviços como Render/Railway/Fly.io, alguns links do YouTube podem retornar `Sign in to confirm you're not a bot`. Isso acontece quando o YouTube não confia no IP do servidor. O projeto inclui runtime JavaScript para o yt-dlp, mas essa proteção do YouTube pode continuar acontecendo em servidores públicos. Para testes mais confiáveis com YouTube, rode localmente no seu PC ou em um servidor próprio com uso autorizado.

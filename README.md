# Infocloudarc

Private cloud infrastructure console: inventory, networking, storage, monitoring, backup, service disaster recovery, IAM, and licensing.

## Run for development

```bash
git clone https://github.com/JesanT/infocloudarc-console.git
cd infocloudarc-console
npm install
npm run dev
```

The dev server listens on port 8080.

## Production build

Needs Node.js 22. On Ubuntu, if `node` is missing or older than 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

Then:

```bash
cd /infocloudarc-console
git pull
npm install
npm run build
npx vite preview --host 0.0.0.0 --port 8080
```

Open `http://<server>:8080/`. Inventory, network polls, and Service DR are saved on the server in `data/pglite` and come back after a refresh or a process restart. Set `DATABASE_URL` to use Postgres instead of that local database. Sign-in is still the role switcher; real operator accounts are next.

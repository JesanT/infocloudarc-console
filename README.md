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

Open `http://<server>:8080/`. Inventory, virtual machines, services, clusters, physical hosts, applications, databases, storage, backup jobs, operators, reports, and Service DR are stored in separate tables under `data/pglite`. A service points at an application and/or a database, and each of those points at a virtual machine and/or a physical host. A refresh or a restart of the preview process keeps them. Set `DATABASE_URL` to use Postgres instead. Sign-in is still the role switcher.

# Deploy to server (GitHub Actions)

**Your server stays private.** You do **not** need to expose it to the internet. The deploy job runs on a **self-hosted runner** (e.g. on your LAN or on the server itself); that runner connects out to GitHub, so nothing from the internet reaches your server.

This workflow runs on every **push to `main`**: it runs lint + build on GitHub’s runners, and if they pass, the deploy job runs on your self-hosted runner and SSHs into your server to run `git pull` + `docker compose up -d --build`.

---

## 0. Add the self-hosted runner (do this first)

The runner is a small app that runs on **your** machine (e.g. your server) and picks up deploy jobs from GitHub. You add it from GitHub, then install and run it on your machine.

1. **Open the runner setup page**
   - Repo: **https://github.com/tejas2292/WreckVault**
   - Go to **Settings** → **Actions** → **Runners** (left sidebar).
   - Click **“New self-hosted runner”**.

2. **Choose OS**
   - If the runner will run on your **server** (192.168.31.43), pick **Linux** (and the architecture, usually x64).
   - GitHub will show a block of commands. You’ll run those on the server.

3. **On the machine where the runner will run** (e.g. SSH into the server: `ssh wrecker@192.168.31.43`):
   - Run the **Download** and **Configure** commands from GitHub (copy-paste). When it asks for a name, you can use e.g. `wreckvault-server`.
   - When it says “Configure the runner as a service”, run the **Install** and **Start** commands so the runner keeps running after reboot.

4. **Re-enable the deploy job**
   - In the repo, edit `.github/workflows/deploy.yml`: change `if: false` to `if: true` for the deploy job (or remove the `if` line), commit and push.
   - On the next push to `main`, the deploy job will run on your runner.

**Where to run the runner**
- **On the server (192.168.31.43):** Good option. The runner can SSH to `localhost` to deploy the same machine. Add the GitHub secrets (host can be `127.0.0.1` or `192.168.31.43`, and the SSH key must be set up for `wrecker@...` on that server).
- **On another PC on your LAN:** Also fine. That PC must be able to SSH to `192.168.31.43` as `wrecker` (use the deploy SSH key).

---

## 1. Check that the server has the project and Git

SSH in from your machine (you’ll be prompted for the password):

```bash
ssh wrecker@192.168.31.43
```

Then on the server:

```bash
# Find where the project is, e.g.:
ls -la ~
# If you see WreckVault (or your repo folder):
cd ~/WreckVault   # or the path you use
git status
git remote -v
```

If it’s not a git repo or not connected to GitHub, clone it once:

```bash
cd ~
git clone https://github.com/tejas2292/WreckVault.git
cd WreckVault
```

Note the **full path** to the project (e.g. `/home/wrecker/WreckVault`). You’ll need it for `DEPLOY_PROJECT_PATH`.

## 2. SSH key for GitHub Actions (no password in GitHub)

GitHub Actions will log in with an **SSH key**, not your password.

**On your PC (PowerShell or Git Bash):**

```bash
ssh-keygen -t ed25519 -C "wreckvault-deploy" -f deploy_key -N '""'
```

This creates `deploy_key` (private) and `deploy_key.pub` (public).

**On the server (as `wrecker`):**

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "PASTE_CONTENT_OF_deploy_key.pub_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Test from your PC (no password if key is loaded):

```bash
ssh -i deploy_key wrecker@192.168.31.43 "echo OK"
```

## 3. GitHub repository secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret.** Add:

| Secret name            | Value                                      |
|------------------------|--------------------------------------------|
| `DEPLOY_HOST`          | `192.168.31.43`                            |
| `DEPLOY_USER`          | `wrecker`                                  |
| `DEPLOY_PORT`          | `22` (optional; 22 is default)             |
| `DEPLOY_PROJECT_PATH`  | Full path on server, e.g. `/home/wrecker/WreckVault` |
| `DEPLOY_SSH_KEY`       | **Entire contents** of `deploy_key` (private key) |

Do **not** put your SSH password in a secret; the workflow uses the key only.

## 4. After that

- Push to `main` → workflow runs lint + build.
- If they pass → workflow SSHs to the server, runs `git pull` and `docker compose up -d --build`.
- Check runs in the **Actions** tab of the repo.

**Deploy job:** The workflow is set to `runs-on: self-hosted` for the deploy job, so it only runs when you have added a [self-hosted runner](https://docs.github.com/en/actions/guides/adding-self-hosted-runners) (e.g. on the server or another PC on your LAN). Until you add one, the deploy job will wait for a runner; lint and build still run on GitHub. If you prefer not to use a runner, you can remove the `deploy` job from the workflow and run `git pull` and `docker compose up -d --build` on the server yourself when you want to update.

---

## Troubleshooting: "Waiting for a runner"

If the deploy job stays on **Waiting for a runner to pick up this job**:

1. **On GitHub:** Repo → **Settings** → **Actions** → **Runners**. Check your runner:
   - **Idle** (green) = runner is connected and can take jobs. If it’s Idle but the job still waits, try re-running the workflow.
   - **Offline** (grey) = runner is not connected. Go to step 2.

2. **On the server (SSH in):** The runner must be **running**. If you only ran `./run.sh` and closed the terminal, it stopped.
   - Check: `cd ~/actions-runner && sudo ./svc.sh status` (if installed as a service).
   - If not installed as a service: `cd ~/actions-runner && ./run.sh` (keep the terminal open), or install and start the service:
     ```bash
     cd ~/actions-runner
     sudo ./svc.sh install
     sudo ./svc.sh start
     sudo ./svc.sh status
     ```
   - After starting, wait a few seconds and refresh the **Runners** page on GitHub; the runner should show **Idle**.

3. **Labels:** The job uses `runs-on: self-hosted`. The default runner has the label `self-hosted`, so it should match. If you added custom labels when configuring, ensure the job’s `runs-on` matches (e.g. `runs-on: [self-hosted, Linux]`).

---

## Runner starts on server reboot

After `sudo ./svc.sh install` and `sudo ./svc.sh start`, the runner is a **systemd service** and should start on boot. To make sure it is enabled:

```bash
cd ~/actions-runner
# Find the exact service name (e.g. actions.runner.tejas2292-WreckVault.wrecker.service)
ls /etc/systemd/system/ | grep actions.runner
# Enable start on boot (use the name from above)
sudo systemctl enable actions.runner.tejas2292-WreckVault.wrecker.service
# Optional: confirm it’s enabled
systemctl is-enabled actions.runner.tejas2292-WreckVault.wrecker.service
```

Replace `actions.runner.tejas2292-WreckVault.wrecker.service` with the name you see from the `ls` command (repo and runner name may vary). After this, the runner will start automatically when the server reboots.

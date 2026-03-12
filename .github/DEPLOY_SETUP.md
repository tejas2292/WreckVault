# Deploy to server (GitHub Actions)

**Your server stays private.** You do **not** need to expose it to the internet. The deploy job runs on a **self-hosted runner** (e.g. on your LAN or on the server itself); that runner connects out to GitHub, so nothing from the internet reaches your server.

This workflow runs on every **push to `main`**: it runs lint + build on GitHub’s runners, and if they pass, the deploy job runs on your self-hosted runner and SSHs into your server to run `git pull` + `docker compose up -d --build`.

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

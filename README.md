# 🛡️ WreckVault
> **Your Digital Fortress. Zero Knowledge. Maximum Security.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)
![Node](https://img.shields.io/badge/node.js-6DA55F?style=flat&logo=node.js&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=flat&logo=postgresql&logoColor=white)

WreckVault is a modern, self-hosted password manager built for those who want **total control** over their data. Unlike cloud providers, your secrets never leave your device unencrypted. We use a **Zero-Knowledge Architecture** where the server only stores encrypted blobs; the decryption key (your Master Password) exists *only* in your browser's memory.

---

## ✨ Features

### Core Security
- **🔐 Zero-Knowledge Encryption** — AES-256 encryption happens entirely on the client. The server *never* sees your passwords, card details, or notes in plaintext.
- **🛡️ Master Password** — A single master password derives the encryption key. It never leaves your browser.

### Vault Types
- **🔑 Password Manager** — Store credentials with service name, username, website URL, and encrypted passwords.
- **💳 Card Store** — Securely save credit/debit cards with live card preview, auto brand detection (Visa, Mastercard, Amex, Discover), and masked display.
- **📝 Secure Notes** — Encrypted free-text notes for recovery codes, API keys, secrets, or anything sensitive.

### Organisation & Productivity
- **📂 Categories** — Organise entries into categories: Login, Server, Database, Network, Email, Development, DevOps, Cloud, Remote Access, Finance, Social, and Other.
- **⭐ Favorites** — Star any entry for quick access. Filter the entire vault to show favorites only.
- **🔍 Search** — Instant search across all entry types by name or username.
- **🏷️ Type Tabs** — Switch between Passwords, Cards, and Notes with count badges.
- **🎯 Category Filters** — Filter password entries by category with pill-style buttons.

### Password Tools
- **🎲 Password Generator** — Built-in generator with customisable length (8–64), and toggles for uppercase, lowercase, numbers, and symbols.
- **📊 Password Strength Meter** — Real-time 6-level visual indicator (Very Weak → Excellent) with colour-coded feedback.

### User Experience
- **🎨 Glassmorphic Dark UI** — A premium, dark-themed interface with glass panels, gradient accents, and smooth animations.
- **👤 Profile Page** — View stats (total passwords, member since, vault status), change profile image, and delete account.
- **⚙️ Settings** — Auto-lock timer, vault export (JSON), and vault import.
- **📋 One-Click Copy** — Copy passwords, card numbers, and notes to clipboard instantly.
- **🐳 Dockerized** — Deploys in seconds with `docker-compose up`.
- **🕸️ Open Source** — No hidden code. Audit the security yourself.

---

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed on your machine.

### Quick Start

1.  **Clone the repository**
    ```bash
    git clone https://github.com/tejas2292/WreckVault.git
    cd WreckVault
    ```

2.  **Configure environment**
    ```bash
    cp server/.env.example server/.env
    ```

3.  **Ignite the Engine** 🏎️
    ```bash
    docker-compose up --build
    ```

4.  **Access the Vault**
    Open your browser and navigate to:
    👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🏗️ Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | Blazing fast UI with client-side routing. |
| **Styling** | Vanilla CSS | Custom glassmorphic dark theme with CSS variables. |
| **Backend** | Node.js + Express | Lightweight REST API for encrypted storage. |
| **Database** | PostgreSQL | Robust relational data storage with auto-migrations. |
| **Security** | Crypto-JS (AES-256) | Industry-standard client-side encryption. |
| **Deployment** | Docker + GitHub Actions | Containerised with CI/CD pipeline. |

---

## 📸 Screenshots

| Login Screen |
| :---: |
| <img width="1916" height="913" alt="1" src="https://github.com/user-attachments/assets/259d9e61-0ecf-49db-a5bd-a0279938318b" /> |

| Vault Dashboard |
| :---: |
| <img width="1918" height="915" alt="2" src="https://github.com/user-attachments/assets/4de5adc2-f27e-4f1c-a4c3-41d629d08014" /> |

---

## 🛠️ Security Model

```
User → Master Password → Browser Key Derivation → AES-256 Encrypt/Decrypt
                                    ↕
                          Server (encrypted blobs only)
```

1.  **User enters Master Password** — stored only in browser session memory.
2.  **Key Derivation** — Browser derives a cryptographic key from the master password.
3.  **Operations**:
    - **Read**: Browser requests encrypted data → decrypts locally in the browser.
    - **Write**: Browser encrypts data → sends only the ciphertext to the server.
4.  **Result**: If the database is compromised, the attacker only sees encrypted blobs — no plaintext passwords, card numbers, or notes.

---

## 📁 Project Structure

```
WreckVault/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── components/     # UI components
│       │   ├── VaultDashboard.jsx
│       │   ├── PasswordList.jsx
│       │   ├── PasswordModal.jsx
│       │   ├── PasswordStrength.jsx
│       │   ├── CardList.jsx
│       │   ├── CardModal.jsx
│       │   ├── NoteList.jsx
│       │   ├── NoteModal.jsx
│       │   ├── ProfilePage.jsx
│       │   └── SettingsPage.jsx
│       ├── constants/      # Categories, config
│       ├── contexts/       # Auth & Vault context providers
│       └── utils/          # Encryption, clipboard, password generator
├── server/                 # Node.js + Express backend
│   ├── db.js               # PostgreSQL connection & migrations
│   ├── index.js            # API routes
│   └── Dockerfile
├── docker-compose.yml
└── .github/workflows/      # CI/CD deployment
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

<p align="center">
  Built with ❤️ by Tejas
</p>

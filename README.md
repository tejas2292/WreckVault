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

- **🔐 Zero-Knowledge Encryption**: AES-256 encryption happens on the client. The server *never* sees your passwords.
- **🐳 Dockerized**: Deploys in seconds with a single `docker-compose up` command.
- **🎨 Sleek UI**: A beautiful, dark-themed interface built with React and Vanilla CSS.
- **⚡ Real-time**: Fast, responsive interactions powered by a Node.js/Express backend.
- **🕸️ Open Source**: No hidden code. Audit the security yourself.

## 🚀 Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed on your machine.

### Quick Start

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/wreckvault.git
    cd wreckvault
    ```

2.  **Ignite the Engine** 🏎️
    ```bash
    docker-compose up --build
    ```

3.  **Access the Vault**
    Open your browser and navigate to:
    👉 **[http://localhost:3000](http://localhost:3000)**

## 🏗️ Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React + Vite | Blazing fast UI with client-side routing. |
| **Styling** | Vanilla CSS | Custom variables for a pixel-perfect Dark Mode. |
| **Backend** | Node.js + Express | Lightweight API for handling encrypted storage. |
| **Database** | PostgreSQL | Robust, relational data storage. |
| **Security** | Crypto-JS | Industry standard AES encryption library. |

## 📸 Screenshots

| Login Screen | Vault Dashboard |
| :---: | :---: |
| *(Add Login Screenshot Here)* | *(Add Dashboard Screenshot Here)* |

## 🛠️ Security Model

1.  **User enters Master Password.**
2.  **Key Derivation**: Browser derives a cryptographic key.
3.  **Operation**:
    - **Read**: Browser requests encrypted data -> Decrypts locally.
    - **Write**: Browser encrypts data -> Sends only the ciphertext to server.
4.  **Result**: If the database is compromised, the attacker only sees garbage text.

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

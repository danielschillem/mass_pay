# MynaPay - Orange BF S2S VPN

Ce dossier contient la configuration de base pour établir le tunnel IPsec site-a-site demande par Orange BF avant la livraison des credentials CASHIN.

## Parametres Orange extraits du fichier XLSX

```text
Orange VPN gateway: 197.239.106.3
Orange encryption domain: 197.239.106.83/32, 197.239.106.84/32
Services applicatifs Orange: tcp/8243, tcp/9443

IKE phase 1:
- IKEv2
- PSK
- DH group 15 / modp3072
- AES-256
- SHA-256
- Lifetime 86400s
- XAuth disabled
- Mode config disabled

IPsec phase 2:
- ESP
- PFS group 15 / modp3072
- AES-256
- SHA-256
- Lifetime 3600s
- Aggressive mode no
```

## Parametres partenaire proposes

```text
Partner VPN device type: Ubuntu 24.04 LTS + strongSwan
Partner public IP: 187.127.233.228
Partner local encryption domain: 187.127.233.228/32
```

## Installation sur le VPS

Generer ou convenir d'une PSK avec Orange, puis lancer sur le VPS :

```bash
export OBF_VPN_PSK='<pre-shared-key-a-echanger-avec-orange>'
bash setup-hostinger-obf.sh
```

Ensuite verifier :

```bash
ipsec statusall
journalctl -u strongswan-starter -n 100 --no-pager
curl --connect-timeout 10 -vk https://197.239.106.83:8243/
curl --connect-timeout 10 -vk https://197.239.106.84:9443/
```

Le mot de passe root initial du VPS doit etre remplace apres installation, et l'acces SSH doit passer par cle.

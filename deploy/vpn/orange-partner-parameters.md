# Parametres VPN partenaire - MynaPay / OBF

## Contact partenaire

```text
Company: MYNA ETOILE SARL / MynaPay
Technical contact: A completer
Email: A completer
Phone: A completer
```

## VPN gateway partenaire

```text
VPN device type: Ubuntu 24.04 LTS + strongSwan
Provider: Hostinger VPS KVM 2
Public IP address: 187.127.233.228
Local encryption domain: 187.127.233.228/32
Authentication method: Pre-Shared Key
Pre-Shared Key: a echanger via canal securise
```

## IKE phase 1

```text
Encryption scheme: IKE v2
Perfect Forward Secrecy - IKE: DH Group 15
Encryption algorithm - IKE: AES 256
Hashing algorithm - IKE: SHA 256
IKE SA lifetime: 86400 seconds
XAuth: Disabled
Mode Config: Disabled
Aggressive mode: No
```

## IPsec phase 2

```text
Transform: ESP
Perfect Forward Secrecy - IPsec: DH Group 15
Encryption algorithm - IPsec: AES 256
Hashing algorithm - IPsec: SHA 256
IPsec SA lifetime: 3600 seconds
Key exchange for subnet: Yes
```

## OBF side from provided document

```text
OBF VPN gateway: 197.239.106.3
OBF encryption domain hosts:
- 197.239.106.83/32
- 197.239.106.84/32
Protocol: IP
Services:
- tcp/8243
- tcp/9443
```

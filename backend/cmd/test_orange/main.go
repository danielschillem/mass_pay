package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"masspay-bf/internal/config"
	"masspay-bf/internal/gateway"
	"masspay-bf/internal/models"

	"github.com/joho/godotenv"
)

func main() {
	send := flag.Bool("send", false, "envoyer réellement la transaction de test Orange")
	phoneFlag := flag.String("phone", "", "MSISDN destinataire du test")
	amount := flag.Int64("amount", 1, "montant du test en FCFA")
	flag.Parse()

	// Charge backend/.env (chemin relatif au répertoire d'exécution backend/)
	if err := godotenv.Load(".env"); err != nil {
		log.Printf("Avertissement : impossible de charger .env (%v), on utilise l'env système", err)
	}

	cfg := config.Load()

	fmt.Println("=== Test Orange Money BF — CASHIN Production ===")
	fmt.Printf("ENV        : %s\n", cfg.OrangeEnv)
	fmt.Printf("Token URL  : %s\n", cfg.OrangeCashinTokenURL)
	fmt.Printf("Cashin URL : %s\n", cfg.OrangeCashinURL)
	fmt.Printf("Agent alias: %s\n", mask(cfg.OrangeCashinAgentAlias))
	fmt.Printf("Username   : %s\n", mask(cfg.OrangeCashinUsername))
	fmt.Printf("API key    : %s\n", mask(cfg.OrangeCashinAPIKey))
	fmt.Printf("PIN key    : %s\n", cfg.OrangePINPublicKey)
	if cfg.OrangeCertPublic != "" || cfg.OrangeCertPrivate != "" {
		fmt.Printf("Cert public: %s\n", cfg.OrangeCertPublic)
		fmt.Printf("Cert privé : %s\n", cfg.OrangeCertPrivate)
	}
	fmt.Println()

	if err := gateway.ValidateOrangeConfig(cfg); err != nil {
		log.Fatalf("ERREUR : %v", err)
	}
	// Vérification existence des fichiers sensibles référencés par la conf.
	for _, path := range []string{cfg.OrangePINPublicKey, cfg.OrangeCertPublic, cfg.OrangeCertPrivate} {
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); os.IsNotExist(err) {
			log.Fatalf("ERREUR : fichier introuvable : %s", path)
		}
		fmt.Printf("Fichier OK : %s\n", path)
	}
	fmt.Println()

	gw := gateway.New(models.OperatorOrange, cfg)

	// Numéro de test : le bénéficiaire doit être fourni explicitement.
	phone := ""
	if *phoneFlag != "" {
		phone = *phoneFlag
	}
	if flag.NArg() > 0 {
		phone = flag.Arg(0)
	}
	if strings.TrimSpace(phone) == "" {
		log.Fatal("ERREUR : --phone <MSISDN bénéficiaire> est requis pour le CASHIN")
	}
	if *amount <= 0 {
		log.Fatal("ERREUR : --amount doit être supérieur à 0")
	}

	ref := fmt.Sprintf("TEST-%d", time.Now().Unix())

	fmt.Printf("Envoi vers  : %s\n", mask(phone))
	fmt.Printf("Montant     : %d FCFA\n", *amount)
	fmt.Printf("Référence   : %s\n\n", ref)
	fmt.Printf("Flux        : débit agent %s -> crédit bénéficiaire %s\n\n",
		mask(cfg.OrangeCashinAgentAlias), mask(phone))

	if !*send {
		fmt.Println("DRY RUN      : aucun paiement envoyé")
		fmt.Printf("Pour lancer le test réel : go run ./cmd/test_orange --send --phone <MSISDN> --amount %d\n", *amount)
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := gw.Send(ctx, gateway.SendRequest{
		Phone:     phone,
		Amount:    *amount,
		Reference: ref,
		Label:     "Test connectivité MynaPay",
	})
	if err != nil {
		fmt.Printf("RESULTAT : ECHEC\n")
		fmt.Printf("Erreur   : %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("RESULTAT     : SUCCES\n")
	fmt.Printf("Status       : %s\n", resp.Status)
	fmt.Printf("OperatorRef  : %s\n", resp.OperatorRef)
	fmt.Printf("Message      : %s\n", resp.Message)
}

func mask(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "<empty>"
	}
	if len(value) <= 4 {
		return "<set>"
	}
	return value[:2] + "***" + value[len(value)-2:]
}

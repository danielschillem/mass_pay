# ── Build stage ────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app
COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o masspay-server ./cmd/server

# ── Runtime stage ───────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata wget
WORKDIR /app

COPY --from=builder /app/masspay-server .

EXPOSE 8080
CMD ["./masspay-server"]

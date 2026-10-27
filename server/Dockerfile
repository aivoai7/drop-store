FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.20
RUN adduser -D -u 10001 app
USER app
COPY --from=build /out/api /usr/local/bin/api
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:8081/health || exit 1
ENTRYPOINT ["/usr/local/bin/api"]

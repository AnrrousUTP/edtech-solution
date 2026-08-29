# EdTech Solution

Plataforma de cursos de programación con progresión por niveles, gamificación y
aprendizaje asistido por IA. Plan completo en [`plataforma_edtech/`](plataforma_edtech/).

## Arranque local (Windows)

```powershell
bun install
docker compose --profile base up -d      # postgres + localstack + jwt-local
bun run db:migrate
bun run db:seed
docker compose --profile full up         # todo (6 servicios + web + gateway)
```

| URL                              | Qué             |
| -------------------------------- | --------------- |
| http://localhost:3000            | Frontend        |
| http://localhost:8080/api/*      | Gateway (= ALB) |
| http://localhost:4566            | LocalStack      |
| postgres://localhost:5432/edtech | Base de datos   |

## Verificación

```powershell
bun run harness    # arch-check + estructura + convenciones + tests
```

Los supuestos de ejecución están en [`DECISIONS.md`](DECISIONS.md).

---
name: dotnet
description: |
  .NET / C# development skill — write, build, test and refactor C# code using
  the dotnet CLI, xUnit/NUnit, ASP.NET Core (Minimal API), EF Core and NuGet.
  Use when tasks involve C# files (.cs, .csproj, .sln), .NET projects,
  `dotnet build`/`dotnet test`, NuGet packages, or ASP.NET Core / EF Core code.
---

# .NET / C# Skill

Focus: modern .NET (8/9/10), C# 12+, SDK-style projects. Prefer current
SDK conventions; do not introduce legacy `packages.config` or classic csproj.

## Toolchain

| Task | Command |
|---|---|
| Build | `dotnet build` |
| Test | `dotnet test` |
| Run | `dotnet run --project <path>` |
| Add package | `dotnet add package <Id>` |
| Solution | `dotnet sln add <proj>` |
| Format | `dotnet format` (or `csharpier`) |

Use solution filters / TFM target frameworks instead of multi-framework
scaffolding unless a real consumer needs it.

## Project structure

- Prefer a **Clean Architecture** split: `Domain` → `Application` →

  `Infrastructure` → `Api`, under `src/`, with test projects under `tests/`.
- One project per concern; reference inward only (Api → Application → Domain).
- Use **Central Package Management** (`Directory.Packages.props`) to pin
  package versions in one place.
- Keep `Program.cs` thin; move endpoint/module handlers into dedicated files.
- Logging: structured logs with a correlation id / operation / duration.

## Conventions

- **Naming**: PascalCase for types/methods/properties; `camelCase` for local
  variables/parameters; `_camelCase` for private fields; interfaces prefixed `I`.
- **Async all the way**: `async Task`/`ValueTask`, suffix with `Async`, never
  `.Result`/`.Wait()`, never block on async. Respect a passed `CancellationToken`.
- **Nullability**: enable `<Nullable>enable</Nullable>`; use `string?`,
  `required`, and `?.`/`??`/`??=` deliberately. Avoid returning `null` from
  collections/strings.
- **Records** for DTOs/value objects; use `init`/required properties.
- **Dependency injection**: register by convention; prefer constructor injection.
- **Configuration**: read from `IConfiguration`/options pattern, never hardcode
  secrets. Use env vars / user-secrets in dev.

## Error handling

- Use **exceptions for exceptional flows**; prefer result/option types for
  expected failure paths in domain logic.
- Wrap external calls so a provider failure is a *partial* failure, not a
  request failure (per API-First convention).
- Never swallow exceptions silently — log structured context and rethrow or
  map to a typed error.

## Testing

- Prefer **xUnit** (or NUnit) with **FluentAssertions**/`Shouldly`.
- Test project naming: `<Proj>.Tests.Unit`, `.Tests.Contract`, `.Tests.Integration`.
- Keep unit tests I/O-free and fast; use WireMock.Net for provider/stub tests
  and Testcontainers for integration.
- Name tests `Method_Scenario_ExpectedResult`. Follow test-first.

## Common pitfalls

- `async void` (only event handlers), `.Result` blocking, `Task.Run` for CPU-bound
  work, `DateTime.Now` (prefer `DateTimeOffset.UtcNow`), implicit string
  comparisons in culture-sensitive code.
- Mixing ORM/LINQ-to-SQL with in-memory queries — materialize deliberately.
- Referencing Infrastructure from Domain (inversion of dependency).

## Worked example

```csharp
// Application: a service method (records + DI-friendly)
public record AnalyzeRequest(string Address);

public interface IPropertyAnalyzer
{
    Task<AnalysisResult> AnalyzeAsync(AnalyzeRequest request, CancellationToken ct);
}

public sealed class PropertyAnalyzer(IProviderClient provider, ILogger<PropertyAnalyzer> logger)
    : IPropertyAnalyzer
{
    public async Task<AnalysisResult> AnalyzeAsync(AnalyzeRequest request, CancellationToken ct)
    {
        logger.LogInformation("Analyzing {Address}", request.Address);
        // ... return result; never swallow provider failures
    }
}
```

---
name: java
description: |
  Java development skill — write, build, test and refactor Java using Maven or
  Gradle, the standard src/main & src/test layout, JUnit 5, modern package
  naming and feature-based structure. Use when tasks involve .java files,
  pom.xml / build.gradle, Maven/Gradle builds, JUnit 5, or the JVM toolchain.
---

# Java Skill

Focus: current LTS Java (17/21) with Maven or Gradle. Prefer modern
feature-based organization; keep the build tool declaration as the source of truth.

## Toolchain

**Maven**
| Task | Command |
|---|---|
| Build | `./mvnw clean verify` |
| Test | `./mvnw test` |
| Single test | `./mvnw -Dtest=FooTest test` |
| Run | `./mvnw spring-boot:run` |

**Gradle**
| Task | Command |
|---|---|
| Build | `./gradlew clean build` |
| Test | `./gradlew test` |
| Single test | `./gradlew test --tests "FooTest"` |
| Run | `./gradlew bootRun` |

Use the provided wrapper (`mvnw`/`gradlew`) — never rely on a global install.

## Project structure

- Standard layout: `src/main/java`, `src/test/java`, plus
  `src/main/resources`, `src/test/resources`.
- **Package naming**: reverse-DNS (`com.acme.project.feature`).
- Organize **by feature** first (group related classes), layers
  (controller/service/repository) only as a secondary concern.
- Reflection of test packages to main packages (enables package-private access).
- Large projects: split into **multi-module** builds to enforce boundaries.

## Conventions

- **Naming**: `camelCase` methods/variables, `PascalCase` classes,
  `SCREAMING_SNAKE_CASE` constants. Interfaces/impl: use clear verbs/nouns.
- Prefer **records** for immutable data carriers, sealed interfaces for
  closed hierarchies, and pattern matching / switch expressions (Java 17+).
- Use `Optional`/exceptions deliberately — don't return `null` from public API.
- Prefer dependency injection (Spring/Context) over manual service locators.
- JavaDoc on public API; keep it brief.

## Error handling

- Prefer **exceptions for real failures**, not control flow.
- Catch narrowly and translate to domain/typed exceptions at boundaries;
  don't swallow with empty catch blocks.
- For external/provider calls, isolate failure so one source doesn't fail a
  whole operation (partial-failure semantics).

## Testing

- Use **JUnit 5**; name test classes with `Test`/`IT` suffix.
- Assert with AssertJ/Hamcrest for readable assertions; Mockito/Testcontainers
  for isolation/integration.
- Test-first: write the test, see it fail, then implement.

## Common pitfalls

- Returning mutable internals / leaking `null` from APIs.
- `System.out` instead of a logger; swallowing exceptions.
- Raw types / unchecked casts; overuse of `synchronized` (prefer concurrency
  utilities or immutable design).
- Mixing checked exceptions that force leaking throws across layers.

## Worked example

```java
public record Address(String street, int number) {}

public final class AddressNormalizer {
    public Address normalize(String raw) {
        String[] parts = raw.split(",");
        if (parts.length < 2) {
            throw new IllegalArgumentException("invalid address: " + raw);
        }
        return new Address(parts[0].trim(), Integer.parseInt(parts[1].trim()));
    }
}
```

# Этап сборки: Gradle + JDK 21. Тесты гоняем здесь же (-x test убран
# осознанно: зелёный build в образе обязателен, сломанное не деплоим).
FROM gradle:8.10.2-jdk21 AS build
WORKDIR /home/gradle/project
# Сначала только скрипты сборки — чтобы кэшировался слой зависимостей.
COPY backend/settings.gradle backend/build.gradle ./
COPY backend/gradle ./gradle/
COPY backend/gradlew backend/gradlew.bat ./
COPY backend/app/build.gradle ./app/
RUN gradle dependencies --no-daemon -q || true
# Потом весь код и собственно сборка (без запуска тестового образа — тесты уже внутри build).
COPY backend/ ./
RUN gradle :app:bootJar --no-daemon

# Этап рантайма: только JRE, без Gradle и исходников (меньше образ и поверхность атаки).
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /home/gradle/project/app/build/libs/app-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx1536m", "-jar", "app.jar"]

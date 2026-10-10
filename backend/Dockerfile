# Этап сборки: Gradle + JDK 21. Гоняем полный build с тестами —
# сломанное в образ не пакуем (дороже по времени, дешевле по позору).
FROM gradle:8.10.2-jdk21 AS build
WORKDIR /home/gradle/project
# Сначала только скрипты сборки — чтобы кэшировался слой зависимостей.
COPY backend/settings.gradle backend/build.gradle ./
COPY backend/gradle ./gradle/
COPY backend/gradlew backend/gradlew.bat ./
COPY backend/app/build.gradle ./app/
RUN gradle dependencies --no-daemon -q || true
# Потом весь код и собственно сборка c тестами (см. шапку).
COPY backend/ ./
RUN gradle build :app:bootJar --no-daemon

# Этап рантайма: только JRE, без Gradle и исходников (меньше образ и поверхность атаки).
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /home/gradle/project/app/build/libs/app-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx1536m", "-jar", "app.jar"]

@rem
@rem Gradle startup script для Windows (сгенерировано под Gradle 8.10.2).
@rem Запуск: gradlew.bat build  (из каталога backend\)
@rem
@if "%DEBUG%"=="" @echo off
@rem Находим java: сначала JAVA_HOME, иначе java из PATH.
if defined JAVA_HOME goto findJavaFromJavaHome
set JAVA_EXE=java.exe
goto checkJava
:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe
:checkJava
"%JAVA_EXE%" -version >NUL 2>&1
if "%ERRORLEVEL%"=="0" goto init
echo ОШИБКА: java не найден. Установите JDK 21 или задайте JAVA_HOME.>&2
exit /b 1
:init
set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
set APP_HOME=%DIRNAME%
for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi
set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar
"%JAVA_EXE%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*

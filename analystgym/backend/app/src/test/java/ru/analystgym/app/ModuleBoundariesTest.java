package ru.analystgym.app;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition;
import com.tngtech.archunit.library.dependencies.SlicesRuleDefinition;
import org.junit.jupiter.api.Test;

/**
 * Сторожит модульную структуру: пакеты ru.analystgym.* не должны
 * образовывать циклы, а review не должен знать про catalog напрямую
 * (общение модулей — через facade/события, детали — в architecture.md).
 *
 * ВАЖНО: в Фазе 0 модули почти пустые, тест зелёный тривиально.
 * Он начнёт реально работать с Фазы 1, когда появится код, —
 * и именно тогда поймает первую же кривую зависимость.
 */
class ModuleBoundariesTest {

    // Импортируем все классы приложения с тест-класспаса app
    // (зависимости на модули объявлены в app/build.gradle именно ради этого).
    private static final JavaClasses CLASSES =
            new ClassFileImporter().importPackages("ru.analystgym");

    /** Циклы между модулями запрещены: a → b → a делает распил невозможным. */
    @Test
    void modulesWithoutCycles() {
        SlicesRuleDefinition.slices()
                .matching("ru.analystgym.(*)..")
                .namingSlices("модуль $1")
                .should().beFreeOfCycles()
                .check(CLASSES);
    }

    /**
     * Конкретный запрет из архитектуры: пайплайн ревью не ходит в каталог
     * напрямую (рубрику ему передаёт вызывающий модуль practice).
     * Правило-пример: дальше такие добавляются по каждой границе.
     */
    @Test
    void reviewDoesNotDependOnCatalog() {
        ArchRuleDefinition.noClasses()
                .that().resideInAPackage("ru.analystgym.review..")
                .should().dependOnClassesThat().resideInAPackage("ru.analystgym.catalog..")
                .because("рубрику в review передаёт вызывающий модуль, а не прямой доступ")
                // В Фазе 0 пакет review пуст, и ArchUnit падает на правиле без классов.
                // allowEmpty — осознанно: с Фазы 2, когда появится код, правило начнёт
                // реально проверять (убрать флаг нельзя — упадёт CI).
                .allowEmptyShould(true)
                .check(CLASSES);
    }
}

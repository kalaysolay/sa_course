package ru.analystgym.practice.web;

/**
 * Бесплатная квота исчерпана (тариф Free): маппится в 402 с кодом,
 * а не в 403 — это не запрет, а предложение оформить Pro.
 */
public class QuotaExceededException extends RuntimeException {
}

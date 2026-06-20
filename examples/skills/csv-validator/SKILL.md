---
name: csv-validator
description: Validates CSV files against an expected header schema and reports row-level mismatches. Use when the user mentions CSV validation, header checks, or cleaning up tabular data exports.
allowed-tools: Read Grep
license: MIT
---

# CSV validator

A clean, well-formed example skill that passes skilldoctor with grade A.

## When to use

The user has a CSV and wants to confirm its columns match an expected schema,
or wants to find rows that don't conform.

## Steps

1. Read the target CSV file.
2. Compare the header row to the expected column list.
3. Walk the rows and collect any with the wrong number of fields.
4. Report mismatches with their 1-based line numbers.

## Notes

- Keep tool access minimal: this skill only needs `Read` and `Grep`.
- It never writes files or makes network calls.

#!/usr/bin/env node
/**
 * Test compilation script for LWC compiler
 * Compiles a test component and displays diagnostics in JSON and SARIF formats
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { transform } from '@lwc/compiler';
import { convertCompilationResultsToSarif } from './sarif-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function compileComponent() {
    const componentDir = join(__dirname, 'testComponent');
    const componentName = 'testComponent';
    let jsFilename = `${componentName}.js`; // Default to .js

    console.log('🔨 Compiling test component...\n');

    try {
        // Read component files - try both .js and .ts
        let jsContent;
        try {
            jsContent = await readFile(join(componentDir, `${componentName}.js`), 'utf8');
            jsFilename = `${componentName}.js`;
        } catch {
            jsContent = await readFile(join(componentDir, `${componentName}.ts`), 'utf8');
            jsFilename = `${componentName}.ts`;
        }

        const [html, css] = await Promise.all([
            readFile(join(componentDir, `${componentName}.html`), 'utf8'),
            readFile(join(componentDir, `${componentName}.css`), 'utf8').catch(() => ''),
        ]);

        // Compile JavaScript/TypeScript
        console.log(`📄 Compiling ${jsFilename.endsWith('.ts') ? 'TypeScript' : 'JavaScript'}...`);
        const jsResult = await transform(jsContent, jsFilename, {
            namespace: 'x',
            name: componentName,
            outputConfig: {
                minify: false,
            },
        });

        console.log(`✅ ${jsFilename.endsWith('.ts') ? 'TypeScript' : 'JavaScript'} compiled successfully`);
        if (jsResult.warnings && jsResult.warnings.length > 0) {
            console.log(`\n⚠️  JavaScript Warnings:`, jsResult.warnings);
        }

        // Compile HTML template
        console.log('\n📄 Compiling HTML template...');
        const htmlResult = await transform(html, `${componentName}.html`, {
            namespace: 'x',
            name: componentName,
            outputConfig: {
                minify: false,
            },
        });

        console.log('✅ HTML template compiled successfully');
        if (htmlResult.warnings && htmlResult.warnings.length > 0) {
            console.log(`\n⚠️  HTML Warnings:`, htmlResult.warnings);
        }

        // Compile CSS if present
        let cssResult = null;
        if (css) {
            console.log('\n📄 Compiling CSS...');
            cssResult = await transform(css, `${componentName}.css`, {
                namespace: 'x',
                name: componentName,
                outputConfig: {
                    minify: false,
                },
            });

            console.log('✅ CSS compiled successfully');
            if (cssResult.warnings && cssResult.warnings.length > 0) {
                console.log(`\n⚠️  CSS Warnings:`, cssResult.warnings);
            }
        }

        // Write output files
        const outputDir = join(__dirname, 'output');
        await writeFile(
            join(outputDir, 'js-output.json'),
            JSON.stringify(
                {
                    code: jsResult.code,
                    warnings: jsResult.warnings,
                    map: jsResult.map,
                },
                null,
                2
            ),
            'utf8'
        ).catch(() => {
            // Create output directory if it doesn't exist
            return import('fs').then(fs => {
                return fs.promises.mkdir(outputDir, { recursive: true }).then(() => {
                    return writeFile(
                        join(outputDir, 'js-output.json'),
                        JSON.stringify(
                            {
                                code: jsResult.code,
                                warnings: jsResult.warnings,
                                map: jsResult.map,
                            },
                            null,
                            2
                        ),
                        'utf8'
                    );
                });
            });
        });

        await writeFile(
            join(outputDir, 'html-output.json'),
            JSON.stringify(
                {
                    code: htmlResult.code,
                    warnings: htmlResult.warnings,
                    map: htmlResult.map,
                },
                null,
                2
            ),
            'utf8'
        );

        if (cssResult) {
            await writeFile(
                join(outputDir, 'css-output.json'),
                JSON.stringify(
                    {
                        code: cssResult.code,
                        warnings: cssResult.warnings,
                        map: cssResult.map,
                    },
                    null,
                    2
                ),
                'utf8'
            );
        }

        // Generate SARIF output
        console.log('\n📋 Generating SARIF output...');
        const sarif = convertCompilationResultsToSarif(
            jsResult,
            htmlResult,
            cssResult,
            {
                toolName: '@lwc/compiler',
                componentName: componentName,
            }
        );

        await writeFile(
            join(outputDir, 'compiler-output.sarif.json'),
            JSON.stringify(sarif, null, 2),
            'utf8'
        );

        console.log(`\n📊 Output written to: ${outputDir}/`);
        console.log('  - js-output.json');
        console.log('  - html-output.json');
        if (cssResult) {
            console.log('  - css-output.json');
        }
        console.log('  - compiler-output.sarif.json');

        console.log('\n✨ Compilation complete!\n');

    } catch (error) {
        console.error('\n❌ Compilation Error\n');
        
        // Display the formatted error message (with ANSI colors)
        console.error(error.message);
        
        // Create diagnostic object similar to lwc-platform
        const errorDiagnostic = {
            code: error.code,
            message: error.message,
            level: error.level !== undefined ? error.level : 0, // Default to Fatal
            filename: error.filename || jsFilename,
            location: error.location,
        };
        
        // Print diagnostic details
        console.error('\n📋 Error Details:');
        console.error(`  Code: ${error.code || 'N/A'}`);
        console.error(`  Level: ${getLevelName(errorDiagnostic.level)}`);
        console.error(`  File: ${errorDiagnostic.filename}`);
        if (error.location) {
            console.error(`  Location: Line ${error.location.line}, Column ${error.location.column}`);
        }
        
        // Generate SARIF for error
        try {
            const outputDir = join(__dirname, 'output');
            
            const sarif = convertCompilationResultsToSarif(
                { warnings: [errorDiagnostic] },
                { warnings: [] },
                null,
                {
                    toolName: '@lwc/compiler',
                    componentName: componentName,
                }
            );
            
            await writeFile(
                join(outputDir, 'compiler-output.sarif.json'),
                JSON.stringify(sarif, null, 2),
                'utf8'
            );
            
            console.error(`\n📋 SARIF output written to: ${outputDir}/compiler-output.sarif.json`);
        } catch (sarifError) {
            console.error(`\nFailed to generate SARIF output: ${sarifError.message}`);
        }
        
        process.exit(1);
    }
}

function getLevelName(level) {
    // DiagnosticLevel: Fatal=0, Error=1, Warning=2, Log=3
    switch (level) {
        case 0:
            return 'Fatal';
        case 1:
            return 'Error';
        case 2:
            return 'Warning';
        case 3:
            return 'Log';
        default:
            return 'Unknown';
    }
}

compileComponent();


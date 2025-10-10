/**
 * SARIF (Static Analysis Results Interchange Format) utilities
 * Converts LWC compiler diagnostics to SARIF 2.1.0 format
 */

/**
 * Convert diagnostic level to SARIF level
 * @param {number} level - DiagnosticLevel (Fatal=0, Error=1, Warning=2, Log=3)
 * @returns {'error'|'warning'|'note'}
 */
function toSarifLevel(level) {
    if (level === 0 || level === 1) return 'error'; // Fatal or Error
    if (level === 2) return 'warning';
    return 'note';
}

/**
 * Get error code from diagnostic
 * @param {Object} diagnostic
 * @returns {string|undefined}
 */
function getRuleId(diagnostic) {
    if (!diagnostic.code) return undefined;
    return typeof diagnostic.code === 'number' 
        ? `LWC${diagnostic.code}` 
        : String(diagnostic.code);
}

/**
 * Find error info URL by code
 * @param {number|string} code
 * @returns {string|undefined}
 */
function getHelpUri(code) {
    if (!code) return undefined;
    
    // Common error codes with documentation
    const errorUrls = {
        1007: 'https://lwc.dev/guide/errors',
        1000: 'https://lwc.dev/guide/errors',
        1001: 'https://lwc.dev/guide/errors',
        1002: 'https://lwc.dev/guide/errors',
        1003: 'https://lwc.dev/guide/errors',
        1004: 'https://lwc.dev/guide/errors',
        1005: 'https://lwc.dev/guide/errors',
        1006: 'https://lwc.dev/guide/errors',
        1008: 'https://lwc.dev/guide/errors',
        1009: 'https://lwc.dev/guide/errors',
        1010: 'https://lwc.dev/guide/errors',
    };
    
    const numericCode = typeof code === 'string' ? parseInt(code.replace('LWC', ''), 10) : code;
    return errorUrls[numericCode] || `https://lwc.dev/guide/errors#lwc${numericCode}`;
}

/**
 * Convert compiler diagnostics to SARIF format
 * @param {Array} diagnostics - Array of compiler diagnostics
 * @param {Object} options - Options
 * @param {string} options.toolName - Name of the tool
 * @param {string} options.componentName - Name of the component being compiled
 * @returns {Object} SARIF log object
 */
export function convertDiagnosticsToSarif(diagnostics, options = {}) {
    const toolName = options.toolName || '@lwc/compiler';
    const componentName = options.componentName || 'unknown';
    
    const rulesById = new Map();
    
    const results = diagnostics.map((d) => {
        const ruleId = getRuleId(d);
        
        // Add rule to rules map if not already present
        if (ruleId && !rulesById.has(ruleId)) {
            const shortDescription = d.message ? d.message.split(':')[0] : ruleId;
            rulesById.set(ruleId, {
                id: ruleId,
                name: ruleId,
                shortDescription: { text: shortDescription },
                helpUri: getHelpUri(d.code),
            });
        }
        
        // Build location info
        const location = d.location;
        const filename = d.filename || `${componentName}.js`;
        
        const sarifLocation = filename || location ? [{
            physicalLocation: {
                artifactLocation: filename ? { uri: filename } : undefined,
                region: location ? {
                    startLine: location.line,
                    startColumn: location.column,
                } : undefined,
            },
        }] : undefined;
        
        return {
            ruleId,
            rank: d.level === 0 ? 100 : -1, // rank = 100 for Fatal, -1 for others
            level: toSarifLevel(d.level),
            message: { text: d.message || 'Unknown error' },
            locations: sarifLocation,
            properties: {
                code: d.code,
                isFatal: d.level === 0,
            },
        };
    });
    
    const rules = Array.from(rulesById.values());
    
    return {
        version: '2.1.0',
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
        runs: [{
            tool: {
                driver: {
                    name: toolName,
                    rules: rules.length ? rules : undefined,
                },
            },
            results,
        }],
    };
}

/**
 * Convert compilation results (with warnings) to SARIF format
 * @param {Object} jsResult - JavaScript compilation result
 * @param {Object} htmlResult - HTML compilation result
 * @param {Object} cssResult - CSS compilation result (optional)
 * @param {Object} options - Options
 * @returns {Object} SARIF log object
 */
export function convertCompilationResultsToSarif(jsResult, htmlResult, cssResult, options = {}) {
    const allDiagnostics = [];
    
    // Collect all diagnostics from all compilation results
    if (jsResult?.warnings) {
        allDiagnostics.push(...jsResult.warnings.map(w => ({
            ...w,
            filename: w.filename || `${options.componentName || 'component'}.js`,
        })));
    }
    
    if (htmlResult?.warnings) {
        allDiagnostics.push(...htmlResult.warnings.map(w => ({
            ...w,
            filename: w.filename || `${options.componentName || 'component'}.html`,
        })));
    }
    
    if (cssResult?.warnings) {
        allDiagnostics.push(...cssResult.warnings.map(w => ({
            ...w,
            filename: w.filename || `${options.componentName || 'component'}.css`,
        })));
    }
    
    // Remove duplicates based on code, message, filename, line, column
    const seen = new Set();
    const uniqueDiagnostics = allDiagnostics.filter(d => {
        const key = [
            d.code || '',
            d.message || '',
            d.filename || '',
            d.location?.line || '',
            d.location?.column || '',
        ].join('|');
        
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    
    return convertDiagnosticsToSarif(uniqueDiagnostics, options);
}


const scopeChainCache = new Map<string, any[]>();

export function getPolicyCache() {
    return scopeChainCache;
}

export function clearPolicyCache(entityType?: string, entityId?: string) {
    if (!entityType || !entityId) {
        scopeChainCache.clear();
        return;
    }
    
    const cacheKey = `${entityType}:${entityId}`;
    scopeChainCache.delete(cacheKey);
    
    console.log(`Caché limpia para: ${cacheKey}`);
}
const slugify = require('slugify');

/**
 * Build a slug from `source` that no other document in `Model` uses yet.
 * Slugs are unique platform-wide, but different brands legitimately sell
 * products with the same name, so a taken slug gets a numeric suffix
 * (planetary-gearbox, planetary-gearbox-2, planetary-gearbox-3, ...).
 * Pass `excludeId` on update so a document doesn't collide with itself.
 */
const generateUniqueSlug = async (Model, source, excludeId = null) => {
    const base = slugify(String(source || ''), { lower: true, strict: true }) || 'item';
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const query = { slug: new RegExp(`^${escaped}(-\\d+)?$`) };
    if (excludeId) query._id = { $ne: excludeId };

    const taken = new Set((await Model.find(query).select('slug').lean()).map(d => d.slug));
    if (!taken.has(base)) return base;

    let suffix = 2;
    while (taken.has(`${base}-${suffix}`)) suffix++;
    return `${base}-${suffix}`;
};

module.exports = { generateUniqueSlug };

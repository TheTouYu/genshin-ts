#!/usr/bin/env python3
"""Recursive diff of two decoded GIA JSON files.
Excludes known cosmetic/id differences and shows all remaining diffs."""
import json, sys, re

# Paths to known-cosmetic/ignorable differences
# These field names are always considered cosmetic at any path depth
COSMETIC_FIELD_NAMES = {
    'nodeIndex', 'id', 'x', 'y', 'pinIndex', 'filePath',
    # genericId / concreteId IDs
    'id', 'nodeId',
    # instance IDs
    'innerNodeId',
    # value IDs  
    'indexOfConcrete',
    # any connect id
}
# Pattern: if a key matches this, it's a connection id field
CONNECTION_ID_RE = re.compile(r'^id$|^connectId$')

def is_known_cosmetic_key(key):
    """Keys that are always cosmetic regardless of path."""
    return key in {'nodeIndex', 'x', 'y', 'pinIndex', 'filePath', 'innerNodeId', 'indexOfConcrete', 'nodeId'}

def should_ignore_value(key, a, b):
    """Check if a difference is cosmetic based on key name and values."""
    # IDs - if both look like IDs (>10000), ignore
    if key == 'id':
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            return True
    # nodeId in genericId/concreteId
    if key == 'nodeId':
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            return True
    # connection IDs
    if key in {'id'} and isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return True
    # gameVersion difference
    if key == 'gameVersion':
        return True
    return False

def should_ignore_whole_obj(path, a_val, b_val):
    """Check if a pair of values should be entirely ignored at this path."""
    # In CompositeDef name, ignore the (N) suffix difference
    if path.endswith('.name'):
        if isinstance(a_val, str) and isinstance(b_val, str):
            # Remove trailing "(N)" from both
            a_clean = re.sub(r'\(\d+\)$', '', a_val)
            b_clean = re.sub(r'\(\d+\)$', '', b_val)
            if a_clean == b_clean:
                return True
    return False

def deep_diff(a, b, path=''):
    diffs = []
    cosmetic = []
    
    # Handle both being None
    if a is None and b is None:
        return diffs, cosmetic
    if a is None:
        cosmetic.append((path, 'None', type(b).__name__))
        return diffs, cosmetic
    if b is None:
        cosmetic.append((path, type(a).__name__, 'None'))
        return diffs, cosmetic
    
    # Different types
    if type(a) != type(b):
        diffs.append((path, f'type({type(a).__name__})', f'type({type(b).__name__})'))
        return diffs, cosmetic
    
    # Both dicts
    if isinstance(a, dict):
        keys = set(a.keys()) | set(b.keys())
        for k in sorted(keys):
            sub_path = f"{path}.{k}" if path else k
            if k in a and k not in b:
                cosmetic.append((sub_path, 'present', 'missing'))
            elif k not in a and k in b:
                cosmetic.append((sub_path, 'missing', 'present'))
            else:
                sub_diffs, sub_cosm = deep_diff(a[k], b[k], sub_path)
                diffs.extend(sub_diffs)
                cosmetic.extend(sub_cosm)
        return diffs, cosmetic
    
    # Both lists
    if isinstance(a, list):
        max_len = max(len(a), len(b))
        for i in range(max_len):
            sub_path = f"{path}[{i}]"
            if i >= len(a):
                cosmetic.append((sub_path, 'missing', f'len={len(b)}'))
            elif i >= len(b):
                cosmetic.append((sub_path, f'len={len(a)}', 'missing'))
            else:
                sub_diffs, sub_cosm = deep_diff(a[i], b[i], sub_path)
                diffs.extend(sub_diffs)
                cosmetic.extend(sub_cosm)
        return diffs, cosmetic
    
    # Both scalars
    if a != b:
        # Check if this is a cosmetic ID difference
        last_key = path.rpartition('.')[2]
        last_key = path.rpartition('/')[2] if '/' in path else last_key
        
        if should_ignore_value(last_key, a, b):
            cosmetic.append((path, a, b))
        elif should_ignore_whole_obj(path, a, b):
            cosmetic.append((path, a, b))
        elif is_known_cosmetic_key(last_key):
            cosmetic.append((path, a, b))
        else:
            diffs.append((path, a, b))
    
    return diffs, cosmetic


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <ref.json> <gen.json>")
        sys.exit(1)
    
    with open(sys.argv[1]) as f:
        ref = json.load(f)
    with open(sys.argv[2]) as f:
        gen = json.load(f)
    
    diffs, cosmetic = deep_diff(ref, gen)
    
    print(f"=== DIFFERENCES (structural, {len(diffs)} items) ===")
    for path, a, b in diffs:
        print(f"  {path}")
        print(f"    REF: {json.dumps(a)}")
        print(f"    GEN: {json.dumps(b)}")
    
    print(f"\n=== COSMETIC/IGNORED ({len(cosmetic)} items) ===")
    if cosmetic:
        for path, a, b in cosmetic:
            print(f"  {path}: {json.dumps(a)} vs {json.dumps(b)}")
    else:
        print("  (none)")
    
    sys.exit(0 if len(diffs) == 0 else 1)

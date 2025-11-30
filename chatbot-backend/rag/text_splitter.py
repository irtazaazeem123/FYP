# rag/text_splitter.py
from typing import List

def recursive_split(text: str,
                    chunk_size: int = 600,
                    overlap: int = 80) -> List[str]:
    """
    Simple recursive splitter: split by \n\n, then \n, then ., then space.
    """
    if not text:
        return []

    def split_by(text, sep):
        parts = []
        for block in text.split(sep):
            block = block.strip()
            if block:
                parts.append(block)
        return parts

    # staged splits
    blocks = split_by(text, "\n\n")
    refined = []
    for b in blocks:
        if len(b) > chunk_size * 2:
            for bb in split_by(b, "\n"):
                if len(bb) > chunk_size * 2:
                    refined.extend(split_by(bb, ". "))
                else:
                    refined.append(bb)
        else:
            refined.append(b)

    # pack chunks
    chunks = []
    cur = ""
    for seg in refined:
        if len(cur) + len(seg) + 1 <= chunk_size:
            cur = cur + (" " if cur else "") + seg
        else:
            if cur:
                chunks.append(cur.strip())
            cur = seg
    if cur:
        chunks.append(cur.strip())

    # add overlap
    if overlap > 0 and len(chunks) > 1:
        with_ov = []
        prev_tail = ""
        for i, c in enumerate(chunks):
            if i > 0 and prev_tail:
                combined = (prev_tail + " " + c).strip()
                with_ov.append(combined)
            else:
                with_ov.append(c)
            prev_tail = c[-overlap:]
        return with_ov

    return chunks

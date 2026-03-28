"""Document loader for markdown content with frontmatter parsing."""

import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

from app.models.documents import Document, DocumentMetadata


logger = logging.getLogger(__name__)


class DocumentLoader:
    """Loader for markdown documents with YAML frontmatter."""

    def __init__(self, content_root: str):
        """Initialize loader.

        Args:
            content_root: Root directory containing markdown documents
        """
        self.content_root = Path(content_root)

    def load(self) -> List[Document]:
        """Recursively load all markdown documents from content root.

        Returns:
            List of Document objects with parsed metadata and content
        """
        documents = []
        markdown_files = self.content_root.rglob("*.md")

        for filepath in sorted(markdown_files):
            try:
                doc = self._load_file(filepath)
                if doc:
                    documents.append(doc)
            except Exception:
                logger.exception("Error loading %s", filepath)
                continue

        return documents

    def _load_file(self, filepath: Path) -> Optional[Document]:
        """Load a single markdown file.

        Args:
            filepath: Path to markdown file

        Returns:
            Document object or None if parsing fails
        """
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        # Parse frontmatter
        metadata_dict, body = self._parse_frontmatter(content, filepath)

        # Prefer explicit frontmatter ids and fall back to a stable path-derived id.
        doc_id = metadata_dict.get("id") or self._build_fallback_id(filepath)

        # Extract required fields
        title = metadata_dict.get("title", filepath.stem)
        doc_type = metadata_dict.get("type", self._infer_type(filepath))

        # Build metadata
        metadata = DocumentMetadata(
            id=doc_id,
            title=title,
            doc_type=doc_type,
            source_url=metadata_dict.get("canonical_url"),
            tags=metadata_dict.get("tags", []),
            summary=metadata_dict.get("summary"),
            updated=metadata_dict.get("updated"),
            priority=metadata_dict.get("priority", 1),
        )

        return Document(metadata=metadata, content=body)

    def _build_fallback_id(self, filepath: Path) -> str:
        """Build a stable fallback document id from the content-relative path."""
        relative_path = filepath.relative_to(self.content_root).with_suffix("")
        return "/".join(relative_path.parts)

    def _parse_frontmatter(
        self, content: str, filepath: Path
    ) -> tuple[Dict[str, Any], str]:
        """Parse YAML frontmatter from markdown.

        Args:
            content: Full markdown content

        Returns:
            Tuple of (metadata_dict, body_content)
        """
        # YAML frontmatter is between --- markers at the beginning
        if not content.startswith("---"):
            return {}, content

        # Find the closing --- while tolerating LF and CRLF newlines.
        match = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n?(.*)", content, re.DOTALL)
        if not match:
            return {}, content

        frontmatter_text, body = match.groups()

        try:
            metadata = yaml.safe_load(frontmatter_text) or {}
        except yaml.YAMLError:
            logger.warning("Failed to parse YAML frontmatter for %s", filepath)
            metadata = {}

        if not isinstance(metadata, dict):
            logger.warning(
                "Frontmatter is not a mapping; ignoring metadata: %r", metadata
            )
            metadata = {}

        return metadata, body.strip()

    def _infer_type(self, filepath: Path) -> str:
        """Infer document type from directory structure.

        Args:
            filepath: Path to document

        Returns:
            Inferred document type string
        """
        parts = filepath.relative_to(self.content_root).parts
        if len(parts) > 1:
            return parts[0]  # Use parent directory as type
        return "other"

    def validate(self, documents: List[Document]) -> tuple[bool, List[str]]:
        """Validate loaded documents.

        Args:
            documents: List of documents to validate

        Returns:
            Tuple of (is_valid, list_of_errors)
        """
        errors = []

        for doc in documents:
            # Check required fields
            if not doc.metadata.id:
                errors.append(f"Document missing id: {doc.metadata.title}")
            if not doc.metadata.title:
                errors.append(f"Document missing title: {doc.metadata.id}")
            if not doc.metadata.doc_type:
                errors.append(f"Document missing type: {doc.metadata.id}")
            if not doc.content or not doc.content.strip():
                errors.append(f"Document has empty content: {doc.metadata.id}")

        return len(errors) == 0, errors

"""Document loader for markdown content with frontmatter parsing."""

import logging
import re
from datetime import datetime
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
        if not self.content_root.exists() or not self.content_root.is_dir():
            raise ValueError(
                "Content root does not exist or is not a directory: "
                f"{self.content_root}. Set CONTENT_ROOT to a valid path."
            )
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

        raw_id = metadata_dict.get("id")
        raw_title = metadata_dict.get("title")
        raw_type = metadata_dict.get("type")

        # Prefer explicit frontmatter ids and fall back to a stable path-derived id.
        doc_id = raw_id or self._build_fallback_id(filepath)

        # Extract required fields
        title = raw_title or filepath.stem
        doc_type = raw_type or self._infer_type(filepath)

        missing_required_frontmatter = [
            field
            for field, value in {
                "id": raw_id,
                "title": raw_title,
                "type": raw_type,
                "summary": metadata_dict.get("summary"),
                "tags": metadata_dict.get("tags"),
                "updated": metadata_dict.get("updated"),
            }.items()
            if value in (None, "", [])
        ]

        # Build metadata
        metadata = DocumentMetadata(
            id=doc_id,
            title=title,
            doc_type=doc_type,
            source_url=metadata_dict.get("source_url") or metadata_dict.get("canonical_url"),
            tags=metadata_dict.get("tags", []),
            summary=metadata_dict.get("summary"),
            updated=metadata_dict.get("updated"),
            priority=metadata_dict.get("priority", 1),
            missing_required_frontmatter=missing_required_frontmatter,
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
            missing = doc.metadata.extra.get("missing_required_frontmatter", [])
            if missing:
                errors.append(
                    f"Document missing required frontmatter ({', '.join(missing)}): {doc.metadata.id}"
                )

            # Check required fields
            if not doc.metadata.id:
                errors.append(f"Document missing id: {doc.metadata.title}")
            if not doc.metadata.title:
                errors.append(f"Document missing title: {doc.metadata.id}")
            if not doc.metadata.doc_type:
                errors.append(f"Document missing type: {doc.metadata.id}")
            if not doc.content or not doc.content.strip():
                errors.append(f"Document has empty content: {doc.metadata.id}")

            if not isinstance(doc.metadata.tags, list) or len(doc.metadata.tags) == 0:
                errors.append(f"Document tags must include at least one value: {doc.metadata.id}")

            if not self._is_iso_date(doc.metadata.updated):
                errors.append(
                    f"Document updated must be ISO date (YYYY-MM-DD): {doc.metadata.id}"
                )

            if not re.search(r"^#{1,6}\s+.+", doc.content, re.MULTILINE):
                errors.append(
                    f"Document body must include at least one markdown heading: {doc.metadata.id}"
                )

        return len(errors) == 0, errors

    def _is_iso_date(self, value: Optional[str]) -> bool:
        """Return True when value matches YYYY-MM-DD."""
        if not value or not isinstance(value, str):
            return False
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return False
        return True

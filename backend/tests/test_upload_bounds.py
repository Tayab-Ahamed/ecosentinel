from io import BytesIO

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from routers.waste_vision import MAX_IMAGE_SIZE_BYTES, classify_waste_image


@pytest.mark.asyncio
async def test_oversized_image_is_not_fully_read_before_rejection():
    stream = BytesIO(b"x" * (MAX_IMAGE_SIZE_BYTES + 1024 * 1024))
    image = UploadFile(
        stream, filename="large.jpg", headers=Headers({"content-type": "image/jpeg"})
    )
    with pytest.raises(HTTPException) as exc:
        await classify_waste_image(image=image, lat=0, lon=0)
    assert exc.value.status_code == 413
    assert stream.tell() <= MAX_IMAGE_SIZE_BYTES + 1

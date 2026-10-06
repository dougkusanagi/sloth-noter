use arboard::{Clipboard, Error, ImageData};
use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};
use serde::Serialize;

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Contents {
    Image { bytes: Vec<u8> },
    Text { text: String },
}

fn encode_image(image: ImageData<'_>) -> Result<Vec<u8>, String> {
    let length = image
        .width
        .checked_mul(image.height)
        .and_then(|n| n.checked_mul(4));
    if image.width == 0
        || image.height == 0
        || length != Some(image.bytes.len())
        || image.bytes.len() > 80 * 1024 * 1024
    {
        return Err("Invalid clipboard image size".into());
    }
    let width = u32::try_from(image.width).map_err(|e| e.to_string())?;
    let height = u32::try_from(image.height).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    PngEncoder::new(&mut bytes)
        .write_image(&image.bytes, width, height, ExtendedColorType::Rgba8)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Clipboard image exceeds 20 MB".into());
    }
    Ok(bytes)
}

pub fn read() -> Result<Option<Contents>, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    match clipboard.get_image() {
        Ok(image) => {
            return Ok(Some(Contents::Image {
                bytes: encode_image(image)?,
            }))
        }
        Err(Error::ContentNotAvailable) => {}
        Err(error) => return Err(error.to_string()),
    }
    match clipboard.get_text() {
        Ok(text) => Ok(Some(Contents::Text { text })),
        Err(Error::ContentNotAvailable) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;

    #[test]
    fn clipboard_rgba_encodes_as_png_without_losing_pixels() {
        let pixels = [255, 0, 0, 255, 0, 128, 255, 64];
        let bytes = encode_image(ImageData {
            width: 2,
            height: 1,
            bytes: Cow::Borrowed(&pixels),
        })
        .unwrap();
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
        let decoded = image::load_from_memory(&bytes).unwrap().into_rgba8();
        assert_eq!(decoded.dimensions(), (2, 1));
        assert_eq!(decoded.as_raw(), &pixels);
    }

    #[test]
    fn malformed_clipboard_images_are_rejected_before_encoding() {
        for (width, height, bytes) in [(0, 1, vec![]), (1, 1, vec![0; 3]), (usize::MAX, 2, vec![])]
        {
            assert!(encode_image(ImageData {
                width,
                height,
                bytes: Cow::Owned(bytes)
            })
            .is_err());
        }
    }
}
